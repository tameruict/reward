import { Queue } from 'bullmq'

import { createRedisConnection, queueName, queueRuntimeConfig } from './config.js'

function jobDefinition(row) {
    const config = queueRuntimeConfig()
    return {
        name: 'run-account',
        data: {
            jobId: row.id,
            batchId: row.batch_id,
            accountId: row.account_id,
            proxyId: row.proxy_id,
            lockKey: row.lock_key
        },
        opts: {
            jobId: row.queue_job_id,
            attempts: row.max_attempts,
            backoff: { type: 'exponential', delay: config.retryDelayMs },
            removeOnComplete: 1000,
            removeOnFail: 5000
        }
    }
}

export function createAccountQueue() {
    const connection = createRedisConnection()
    const queue = new Queue(queueName(), { connection })
    return { queue, connection }
}

async function enqueueRow(queue, store, row) {
    const definition = jobDefinition(row)
    try {
        await queue.add(definition.name, definition.data, definition.opts)
        return true
    } catch (error) {
        store.resetPending(row.id, `Queue publish failed: ${error.message}`)
        throw error
    }
}

export async function dispatchAvailableJobs(queue, store, { reconcile = true } = {}) {
    let reconciled = 0
    if (reconcile) {
        for (const row of store.listQueued()) {
            const existing = await queue.getJob(row.queue_job_id)
            if (!existing) {
                await enqueueRow(queue, store, row)
                reconciled += 1
            }
        }
    }

    const reserved = store.reserveDispatchable()
    let dispatched = 0
    for (const row of reserved) {
        await enqueueRow(queue, store, row)
        dispatched += 1
    }
    return { dispatched, reconciled }
}
