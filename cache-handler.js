/** @type {import('next').CacheHandler} */
module.exports = class DevCacheHandler {
  async get() {
    return null;
  }

  async set() {
    return;
  }

  async revalidateTag() {
    return;
  }
};
