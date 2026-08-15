function toBase64Url(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return buf.toString('base64url');
}

function fromBase64Url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new Error('invalid base64url');
  }
  return new Uint8Array(Buffer.from(text, 'base64url'));
}

function randomBytes(size) {
  return require('node:crypto').randomBytes(size);
}

function utf8(text) {
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

module.exports = {
  toBase64Url,
  fromBase64Url,
  randomBytes,
  utf8,
};
