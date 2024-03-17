import md5 from 'crypto-js/md5';

export function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

export function hash(str) {
  return md5(str).toString();
}
