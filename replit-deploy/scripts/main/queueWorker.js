import { getDirname, getProjectRoot, loadEnvFile } from '../utils.js'
import { queueRuntimeConfig } from '../queue/config.js'

const projectRoot = getProjectRoot(getDirname(import.meta.url))
loadEnvFile(projectRoot)

const { backend } = queueRuntimeConfig()
if (backend === 'redis') await import('./redisQueueWorker.js')
else await import('./sqliteQueueWorker.js')
