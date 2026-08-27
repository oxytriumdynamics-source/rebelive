import Redis from 'ioredis';
import { env } from './env';

let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 5) {
          console.error('❌ [Redis] Max retry attempts reached');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    redis.on('connect', () => console.log('✅ [Redis] Connected'));
    redis.on('error', (err) => console.error('❌ [Redis] Error:', err.message));
    redis.on('close', () => console.warn('⚠️  [Redis] Connection closed'));
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  try {
    await getRedis().connect();
  } catch (err) {
    // Redis is optional — log but don't crash
    console.warn('⚠️  [Redis] Could not connect (running without Redis cache):', err);
  }
}

// Token blacklisting helpers
export async function blacklistToken(jti: string, expiresInSeconds: number): Promise<void> {
  await getRedis().set(`bl:${jti}`, '1', 'EX', expiresInSeconds);
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const result = await getRedis().get(`bl:${jti}`);
  return result === '1';
}
