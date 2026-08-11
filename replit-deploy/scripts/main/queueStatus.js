import { getDirname, getProjectRoot, loadEnvFile } from '../utils.js'
import { createAccountQueue, dispatchAvailableJobs } from '../queue/dispatcher.js'
import { JobStore } from '../queue/jobStore.js'
import { queueRuntimeConfig } from '../queue/config.js'

const projectRoot = getProjectRoot(getDirname(import.meta.url))
loadEnvFile(projectRoot)
const store = new JobStore(projectRoot)
const shouldDispatch = process.argv.includes('--dispatch')
const config = queueRuntimeConfig()
let queueResources = null

try {
    if (shouldDispatch) {
        if (config.backend === 'redis') {
            queueResources = createAccountQueue()
            const dispatch = await dispatchAvailableJobs(queueResources.queue, store)
            console.log('Dispatch:', dispatch)
        } else {
            console.log('SQLite backend claims jobs directly; no dispatch step is required.')
        }
    }
    const stats = store.stats()
    console.table(stats.jobs)
    console.table(stats.latestBatches)
} finally {
    store.close()
    if (queueResources) {
        await queueResources.queue.close()
        await queueResources.connection.quit()
    }
}
