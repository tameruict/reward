process.env.QUEUE_BACKEND = 'sqlite'
process.env.QUEUE_DRY_RUN = 'true'
await import('./queueRun.js')
