import crypto from 'node:crypto'

const REFRESH_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
`

export class ProxyLease {
    constructor(redis, lockKey, ttlMs) {
        this.redis = redis
        this.key = `rewards:proxy-lease:${lockKey}`
        this.ttlMs = ttlMs
        this.token = crypto.randomUUID()
        this.timer = null
        this.lost = false
        this.released = false
    }

    async acquire() {
        const result = await this.redis.set(this.key, this.token, 'PX', this.ttlMs, 'NX')
        return result === 'OK'
    }

    startHeartbeat(onLost) {
        const intervalMs = Math.max(1000, Math.floor(this.ttlMs / 3))
        this.timer = setInterval(async () => {
            if (this.released || this.lost) return
            try {
                const refreshed = Number(
                    await this.redis.eval(REFRESH_SCRIPT, 1, this.key, this.token, String(this.ttlMs))
                )
                if (refreshed === 1) return
            } catch {
                // Losing contact with Redis is treated as losing ownership.
            }

            this.lost = true
            clearInterval(this.timer)
            this.timer = null
            onLost?.()
        }, intervalMs)
        this.timer.unref?.()
    }

    async release() {
        this.released = true
        if (this.timer) clearInterval(this.timer)
        this.timer = null
        try {
            return Number(await this.redis.eval(RELEASE_SCRIPT, 1, this.key, this.token)) === 1
        } catch {
            return false
        }
    }
}
