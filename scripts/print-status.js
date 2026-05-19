#!/usr/bin/env node

/*
 * scripts/print-status.js
 *
 * Cross-references PrintNode jobs with Mongo orders and reports mismatches.
 * Run with `node scripts/print-status.js` (dry-run) or `--apply` to backfill.
 *
 * Required env vars:
 *   MONGO_URL            Mongo connection string (MONGODB_URI / MONGO_URI also accepted)
 *
 * Flags:
 *   --apply              actually write fixes to Mongo (default: dry-run)
 *   --days <n>           include orders from the last n days (default: 7)
 *   --limit <n>          how many PrintNode jobs to fetch (default: 500, max: 5000)
 *   --mongo-limit <n>    how many Mongo orders to scan (default: 2000)
 *   --order <n>          only process a single Shopify order_number
 *   --json               emit machine-readable JSON instead of the human table
 *   --verbose            include OK rows in the table (default: only actionable rows)
 *
 * Note: PrintNode only retains jobs for ~30 days, so orders older than that
 * will always show as PURGED. Long --days windows are still useful for
 * spotting orders that have no print job recorded at all.
 */

var monk = require('monk');
var request = require('request');
var moment = require('moment');
var printOrder = require('../lib/printOrder');
var orderChannel = require('../lib/orderChannel');

var MONGO_URI = process.env.MONGO_URL || process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('Missing Mongo connection string.');
  console.error('Set MONGO_URL (or MONGODB_URI / MONGO_URI) before running, e.g.:');
  console.error('  MONGO_URL="mongodb+srv://user:pass@host/db?retryWrites=true&w=majority" npm run print:status');
  process.exit(2);
}

var PRINTNODE_BASE = 'https://api.printnode.com';
var PRINTNODE_MAX_PER_PAGE = 500;

var argv = parseArgs(process.argv.slice(2));
var apply = !!argv.apply;
var sinceDays = parseInt(argv.days || '7', 10);
var limit = clamp(parseInt(argv.limit || PRINTNODE_MAX_PER_PAGE, 10), 1, 5000);
var mongoLimit = clamp(parseInt(argv['mongo-limit'] || '2000', 10), 1, 100000);
var onlyOrderNumber = argv.order ? parseInt(argv.order, 10) : null;
var jsonOutput = !!argv.json;
var verbose = !!argv.verbose;

main().then(function() {
  process.exit(0);
}).catch(function(err) {
  console.error('print-status failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});

async function main() {
  var db = monk(MONGO_URI);
  try {
    var since = moment().subtract(sinceDays, 'days').toDate();
    var pnJobs = await listPrintNodeJobs(limit, since);
    var pnStates = await listPrintNodeStates(limit, since);

    var jobIndex = indexJobs(pnJobs);
    var stateIndex = indexStates(pnStates);
    var titleIndex = indexJobsByOrderNumber(pnJobs, stateIndex);

    var query = buildOrderQuery(since, onlyOrderNumber);
    var orders = await db.get('orders').find(query, {
      sort: { created_at: -1 },
      limit: onlyOrderNumber ? 5 : mongoLimit,
      fields: {
        _id: 1,
        order_number: 1,
        name: 1,
        source_name: 1,
        note_attributes: 1,
        printnode_job_id: 1,
        printed_at: 1,
        print_status: 1,
        print_error: 1,
        print_submitted_at: 1,
        created_at: 1,
        processed_at: 1
      }
    });

    var report = buildReport(orders, jobIndex, stateIndex, titleIndex);

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

    if (apply) {
      await applyFixes(db, report);
    } else if (!jsonOutput) {
      var fixable = report.rows.filter(function(r) { return r.action === 'FIX_DONE' || r.action === 'FIX_FAILED'; }).length;
      if (fixable > 0) {
        console.log('\nRun again with --apply to write ' + fixable + ' fix(es) to Mongo.');
      }
    }
  } finally {
    if (db && typeof db.close === 'function') {
      db.close();
    }
  }
}

function parseArgs(argv) {
  var out = {};
  for (var i = 0; i < argv.length; i++) {
    var token = argv[i];
    if (token.indexOf('--') !== 0) {
      continue;
    }
    var key = token.slice(2);
    var next = argv[i + 1];
    if (next === undefined || next.indexOf('--') === 0) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function clamp(value, min, max) {
  if (isNaN(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function buildOrderQuery(since, orderNumber) {
  if (orderNumber) {
    return { order_number: orderNumber };
  }
  return {
    $or: [
      { created_at: { $gte: since.toISOString() } },
      { print_submitted_at: { $gte: since } },
      { processed_at: { $gte: since.toISOString() } }
    ]
  };
}

function listPrintNodeJobs(maxJobs, since) {
  return new Promise(function(resolve, reject) {
    var collected = [];
    var pageSize = Math.min(PRINTNODE_MAX_PER_PAGE, maxJobs);
    var after = null;
    var keepGoing = true;

    function fetchPage() {
      var url = PRINTNODE_BASE + '/printjobs?limit=' + pageSize;
      if (after) {
        url += '&dir=desc&after=' + after;
      } else {
        url += '&dir=desc';
      }
      request.get({
        url: url,
        headers: printOrder.printNodeAuthHeader(),
        json: true
      }, function(err, response, body) {
        if (err) {
          return reject(err);
        }
        if (!response || response.statusCode >= 400) {
          return reject(new Error('PrintNode /printjobs HTTP ' + (response && response.statusCode)));
        }
        if (!Array.isArray(body) || body.length === 0) {
          return resolve(collected);
        }

        for (var i = 0; i < body.length; i++) {
          collected.push(body[i]);
          if (collected.length >= maxJobs) {
            keepGoing = false;
            break;
          }
          if (since && body[i].createTimestamp && new Date(body[i].createTimestamp) < since) {
            keepGoing = false;
          }
        }

        if (!keepGoing || body.length < pageSize) {
          return resolve(collected);
        }

        var last = body[body.length - 1];
        if (!last || !last.id) {
          return resolve(collected);
        }
        after = last.id;
        fetchPage();
      });
    }

    fetchPage();
  });
}

function listPrintNodeStates(maxJobs, since) {
  return new Promise(function(resolve, reject) {
    var collected = [];
    var pageSize = Math.min(PRINTNODE_MAX_PER_PAGE, maxJobs);
    var after = null;
    var keepGoing = true;

    function fetchPage() {
      var url = PRINTNODE_BASE + '/printjobs/states?limit=' + pageSize + '&dir=desc';
      if (after) {
        url += '&after=' + after;
      }
      request.get({
        url: url,
        headers: printOrder.printNodeAuthHeader(),
        json: true
      }, function(err, response, body) {
        if (err) {
          return reject(err);
        }
        if (!response || response.statusCode >= 400) {
          return reject(new Error('PrintNode /printjobs/states HTTP ' + (response && response.statusCode)));
        }
        if (!Array.isArray(body) || body.length === 0) {
          return resolve(collected);
        }

        var pageJobIds = {};
        for (var i = 0; i < body.length; i++) {
          var group = body[i];
          if (!Array.isArray(group) || group.length === 0) {
            continue;
          }
          var first = group[0];
          var jobId = first && (first.printJobId || first.printjobId);
          if (jobId) {
            pageJobIds[jobId] = true;
          }
          collected.push(group);
        }

        var ids = Object.keys(pageJobIds);
        if (collected.length >= maxJobs || ids.length < pageSize) {
          return resolve(collected);
        }

        if (!ids.length) {
          return resolve(collected);
        }
        var minId = ids.reduce(function(acc, id) {
          var n = parseInt(id, 10);
          return acc === null || n < acc ? n : acc;
        }, null);
        if (minId === null) {
          return resolve(collected);
        }
        after = minId;
        fetchPage();
      });
    }

    fetchPage();
  });
}

function indexJobs(jobs) {
  var idx = {};
  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    if (job && job.id) {
      idx[job.id] = job;
    }
  }
  return idx;
}

function indexJobsByOrderNumber(jobs, stateIndex) {
  var idx = {};
  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    if (!job || !job.title) {
      continue;
    }
    var match = /Order:\s*(\d+)/i.exec(job.title);
    if (!match) {
      continue;
    }
    var orderNumber = parseInt(match[1], 10);
    if (!orderNumber) {
      continue;
    }
    var state = stateIndex[job.id] ? stateIndex[job.id].state : null;
    var jobTs = job.createTimestamp ? new Date(job.createTimestamp).getTime() : 0;

    var existing = idx[orderNumber];
    var betterByState = state === 'done' && (!existing || existing.state !== 'done');
    var newerWithSameState = existing && existing.state === state && jobTs > existing.ts;
    var firstSeen = !existing;

    if (firstSeen || betterByState || newerWithSameState) {
      idx[orderNumber] = {
        jobId: job.id,
        state: state,
        ts: jobTs,
        title: job.title
      };
    }
  }
  return idx;
}

function indexStates(stateGroups) {
  var idx = {};
  for (var i = 0; i < stateGroups.length; i++) {
    var group = stateGroups[i];
    if (!Array.isArray(group) || group.length === 0) {
      continue;
    }
    var jobId = group[0] && (group[0].printJobId || group[0].printjobId);
    if (!jobId) {
      continue;
    }
    var latest = printOrder.getLatestState(group);
    if (latest) {
      idx[jobId] = latest;
    }
  }
  return idx;
}

function buildOrderNotes(order) {
  var notes = {};
  if (!order || !Array.isArray(order.note_attributes)) {
    return notes;
  }
  for (var i = 0; i < order.note_attributes.length; i++) {
    var attr = order.note_attributes[i];
    if (!attr || !attr.name) {
      continue;
    }
    var key = attr.name.replace(/ /g, '_').replace(/-/g, '_').toLowerCase();
    notes[key] = attr.value === null || attr.value === undefined ? '' : attr.value.toString();
  }
  return notes;
}

function shouldHavePrinted(order) {
  var notes = buildOrderNotes(order);
  return notes.checkout_method === 'delivery' || notes.checkout_method === 'pickup';
}

function buildReport(orders, jobIndex, stateIndex, titleIndex) {
  var rows = [];
  var seenJobIds = {};

  for (var i = 0; i < orders.length; i++) {
    var order = orders[i];
    var channel = orderChannel.getOrderChannel(order);
    var jobId = order.printnode_job_id || null;
    var matchedBy = jobId ? 'id' : null;

    if (!jobId && order.order_number && titleIndex && titleIndex[order.order_number]) {
      jobId = titleIndex[order.order_number].jobId;
      matchedBy = 'title';
    }

    var pnState = jobId && stateIndex[jobId] ? stateIndex[jobId].state : null;
    var pnMessage = jobId && stateIndex[jobId] ? stateIndex[jobId].message : null;
    var pnTimestamp = jobId && stateIndex[jobId] ? stateIndex[jobId].createTimestamp : null;
    var jobExists = jobId ? !!jobIndex[jobId] : false;
    var mongoStatus = order.print_status || (order.printed_at ? 'done' : (order.printnode_job_id ? 'queued' : 'none'));

    if (jobId) {
      seenJobIds[jobId] = true;
    }

    var action = classify(order, jobId, jobExists, pnState, mongoStatus);

    rows.push({
      orderNumber: order.order_number,
      orderName: order.name,
      orderId: order._id,
      channel: channel.key,
      channelLabel: channel.label,
      source: order.source_name || '',
      jobId: jobId,
      matchedBy: matchedBy,
      printnodeState: pnState,
      printnodeMessage: pnMessage,
      printnodeTimestamp: pnTimestamp,
      jobFoundInList: jobExists,
      mongoStatus: mongoStatus,
      mongoPrintedAt: order.printed_at || null,
      mongoSubmittedAt: order.print_submitted_at || null,
      action: action.code,
      reason: action.reason
    });
  }

  var orphanRows = [];
  var orderJobIds = rows.reduce(function(acc, r) {
    if (r.jobId) acc[r.jobId] = true;
    return acc;
  }, {});
  var jobIds = Object.keys(jobIndex);
  for (var j = 0; j < jobIds.length; j++) {
    var jid = jobIds[j];
    if (!orderJobIds[jid]) {
      var job = jobIndex[jid];
      var state = stateIndex[jid] ? stateIndex[jid].state : null;
      orphanRows.push({
        jobId: parseInt(jid, 10),
        title: job && job.title,
        printer: job && job.printer && job.printer.name,
        printnodeState: state,
        createTimestamp: job && job.createTimestamp,
        action: 'ORPHAN_JOB',
        reason: 'PrintNode has this job but no Mongo order points to it'
      });
    }
  }

  var summary = summarize(rows);

  return {
    sinceDays: sinceDays,
    apply: apply,
    rows: rows,
    orphanJobs: orphanRows,
    summary: summary,
    printnodeJobsFetched: Object.keys(jobIndex).length,
    printnodeStatesFetched: Object.keys(stateIndex).length,
    ordersScanned: orders.length
  };
}

function classify(order, jobId, jobExists, pnState, mongoStatus) {
  var mongoDone = mongoStatus === 'done' && !!order.printed_at;

  if (!jobId) {
    if (shouldHavePrinted(order) && !order.printed_at) {
      return { code: 'MISSING', reason: 'Should print (delivery/pickup) but no PrintNode job recorded' };
    }
    return { code: 'OK', reason: 'No print job (not eligible to print)' };
  }

  if (!pnState && !jobExists) {
    return mongoDone
      ? { code: 'OK', reason: 'PrintNode job aged out (>30 days)' }
      : { code: 'PURGED', reason: 'PrintNode no longer has this job - cannot verify' };
  }

  if (pnState === 'done') {
    if (mongoDone) {
      return { code: 'OK', reason: 'PrintNode and Mongo both report done' };
    }
    return { code: 'FIX_DONE', reason: 'PrintNode says done but Mongo is ' + mongoStatus };
  }

  if (pnState === 'error' || pnState === 'expired') {
    if (mongoStatus === pnState) {
      return { code: 'OK', reason: 'Mongo already records ' + pnState };
    }
    return { code: 'FIX_FAILED', reason: 'PrintNode says ' + pnState + ' but Mongo is ' + mongoStatus };
  }

  if (pnState === 'queued' || pnState === 'sent_to_client' || pnState === 'downloaded' || pnState === 'in_progress' || pnState === 'printing') {
    return { code: 'WAIT', reason: 'Still printing (PrintNode state: ' + pnState + ')' };
  }

  if (pnState) {
    return { code: 'WAIT', reason: 'Unknown PrintNode state: ' + pnState };
  }

  return { code: 'OK', reason: 'No state available' };
}

function summarize(rows) {
  var counts = {
    total: rows.length,
    ok: 0,
    fix_done: 0,
    fix_failed: 0,
    wait: 0,
    missing: 0,
    purged: 0
  };
  for (var i = 0; i < rows.length; i++) {
    switch (rows[i].action) {
      case 'OK': counts.ok++; break;
      case 'FIX_DONE': counts.fix_done++; break;
      case 'FIX_FAILED': counts.fix_failed++; break;
      case 'WAIT': counts.wait++; break;
      case 'MISSING': counts.missing++; break;
      case 'PURGED': counts.purged++; break;
    }
  }
  return counts;
}

function printReport(report) {
  console.log('PrintNode status report — last ' + report.sinceDays + ' day(s)');
  console.log('  Orders scanned : ' + report.ordersScanned + (report.ordersScanned >= mongoLimit ? '  (HIT --mongo-limit, increase to see older orders)' : ''));
  console.log('  PrintNode jobs : ' + report.printnodeJobsFetched + ' (states: ' + report.printnodeStatesFetched + ')');
  console.log('  Mode           : ' + (report.apply ? 'APPLY (writing fixes)' : 'dry-run'));
  if (report.sinceDays > 30) {
    console.log('  Note           : PrintNode retains jobs ~30 days. Orders older than that will show as PURGED.');
  }
  console.log('');

  var visible = report.rows.filter(function(r) {
    if (verbose) return true;
    return r.action !== 'OK';
  });

  if (visible.length === 0) {
    console.log('No actionable rows. Pass --verbose to see OK rows too.');
  } else {
    var header = padRight('ORDER#', 9) + padRight('CHANNEL', 9) + padRight('JOB', 12) + padRight('MATCH', 7) + padRight('PRINTNODE', 14) + padRight('MONGO', 12) + padRight('ACTION', 12) + 'REASON';
    console.log(header);
    console.log(repeat('-', 120));
    for (var i = 0; i < visible.length; i++) {
      var r = visible[i];
      var line = padRight(String(r.orderNumber || r.orderName || '-'), 9) +
        padRight(r.channelLabel || '-', 9) +
        padRight(r.jobId ? String(r.jobId) : '-', 12) +
        padRight(r.matchedBy || '-', 7) +
        padRight(r.printnodeState || (r.jobId && !r.jobFoundInList ? 'purged' : '-'), 14) +
        padRight(r.mongoStatus || '-', 12) +
        padRight(r.action, 12) +
        (r.reason || '');
      console.log(line);
    }
  }

  if (report.orphanJobs.length > 0) {
    console.log('');
    console.log('Orphan PrintNode jobs (no matching Mongo order): ' + report.orphanJobs.length);
    for (var k = 0; k < Math.min(report.orphanJobs.length, 20); k++) {
      var o = report.orphanJobs[k];
      console.log('  job ' + o.jobId + '  ' + (o.printnodeState || '-') + '  "' + (o.title || '') + '"  @ ' + (o.createTimestamp || ''));
    }
    if (report.orphanJobs.length > 20) {
      console.log('  ... ' + (report.orphanJobs.length - 20) + ' more');
    }
  }

  var s = report.summary;
  console.log('');
  console.log('Summary: ok=' + s.ok + '  fix_done=' + s.fix_done + '  fix_failed=' + s.fix_failed + '  wait=' + s.wait + '  missing=' + s.missing + '  purged=' + s.purged);
}

function padRight(str, width) {
  str = String(str);
  if (str.length >= width) {
    return str.slice(0, width - 1) + ' ';
  }
  return str + repeat(' ', width - str.length);
}

function repeat(ch, n) {
  var out = '';
  for (var i = 0; i < n; i++) {
    out += ch;
  }
  return out;
}

function applyFixes(db, report) {
  var fixDone = report.rows.filter(function(r) { return r.action === 'FIX_DONE'; });
  var fixFailed = report.rows.filter(function(r) { return r.action === 'FIX_FAILED'; });

  if (fixDone.length === 0 && fixFailed.length === 0) {
    console.log('\nNo fixes to apply.');
    return Promise.resolve();
  }

  console.log('\nApplying ' + (fixDone.length + fixFailed.length) + ' fix(es)...');

  var tasks = [];
  fixDone.forEach(function(row) {
    tasks.push(new Promise(function(resolve) {
      printOrder.recordPrintDone(db, { _id: row.orderId, order_number: row.orderNumber }, row.jobId, { state: 'done', createTimestamp: row.printnodeTimestamp }, function(err) {
        if (err) {
          console.log('  FAILED order #' + row.orderNumber + ': ' + err.message);
        } else {
          console.log('  fixed (done)   order #' + row.orderNumber + ' job ' + row.jobId);
        }
        resolve();
      });
    }));
  });
  fixFailed.forEach(function(row) {
    tasks.push(new Promise(function(resolve) {
      printOrder.recordPrintFailed(db, { _id: row.orderId, order_number: row.orderNumber }, row.jobId, row.printnodeState, row.printnodeMessage, function(err) {
        if (err) {
          console.log('  FAILED order #' + row.orderNumber + ': ' + err.message);
        } else {
          console.log('  fixed (' + row.printnodeState + ') order #' + row.orderNumber + ' job ' + row.jobId);
        }
        resolve();
      });
    }));
  });

  return Promise.all(tasks);
}
