interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

class ProductsMemoryCache {
  private listCache: Map<string, CacheEntry<any>> = new Map();
  private singleCache: Map<string, CacheEntry<any>> = new Map();

  getList(key: string, ttlMs = DEFAULT_TTL_MS): any | null {
    const entry = this.listCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.listCache.delete(key);
      return null;
    }
    return entry.data;
  }

  setList(key: string, data: any) {
    this.listCache.set(key, { data, timestamp: Date.now() });
  }

  getProduct(slugOrId: string, ttlMs = DEFAULT_TTL_MS): any | null {
    const key = String(slugOrId).toLowerCase().trim();
    const entry = this.singleCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.singleCache.delete(key);
      return null;
    }
    return entry.data;
  }

  setProduct(slugOrId: string, data: any) {
    const timestamp = Date.now();
    const key = String(slugOrId).toLowerCase().trim();
    this.singleCache.set(key, { data, timestamp });

    if (data?.slug) {
      this.singleCache.set(String(data.slug).toLowerCase().trim(), { data, timestamp });
    }
    if (data?.id) {
      this.singleCache.set(String(data.id).toLowerCase().trim(), { data, timestamp });
    }
  }

  clear() {
    this.listCache.clear();
    this.singleCache.clear();
  }
}

export const productsCache = new ProductsMemoryCache();
