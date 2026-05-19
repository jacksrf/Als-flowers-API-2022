var url = process.env.MONGO_URL || process.env.MONGODB_URI || process.env.MONGO_URI;

if (!url) {
  console.error('FATAL: MONGO_URL (or MONGODB_URI / MONGO_URI) is not set. Refusing to start.');
  process.exit(1);
}

module.exports = {
  url: url
};
