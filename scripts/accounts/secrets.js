import crypto from 'node:crypto'

const PREFIX = 'enc:v1:'

function masterKey() {
    const key = process.env.ACCOUNTS_DB_KEY?.trim()
    if (!key) {
        throw new Error(
            'ACCOUNTS_DB_KEY is required. Run `npm run accounts -- keygen`, then store the printed value in .env.'
        )
    }
    return key
}

export function encryptAccountSecret(value) {
    const plain = value == null ? '' : String(value)
    if (!plain || plain.startsWith(PREFIX)) return plain

    const salt = crypto.randomBytes(16)
    const iv = crypto.randomBytes(12)
    const key = crypto.scryptSync(masterKey(), salt, 32)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return PREFIX + [salt, iv, tag, encrypted].map(valuePart => valuePart.toString('base64url')).join(':')
}

export function decryptAccountSecret(value, fieldName = 'credential') {
    const stored = value == null ? '' : String(value)
    if (!stored.startsWith(PREFIX)) return stored

    const parts = stored.slice(PREFIX.length).split(':')
    if (parts.length !== 4) throw new Error(`Invalid encrypted ${fieldName} format in account database.`)

    try {
        const [saltValue, ivValue, tagValue, encryptedValue] = parts
        const salt = Buffer.from(saltValue, 'base64url')
        const iv = Buffer.from(ivValue, 'base64url')
        const tag = Buffer.from(tagValue, 'base64url')
        const encrypted = Buffer.from(encryptedValue, 'base64url')
        const key = crypto.scryptSync(masterKey(), salt, 32)
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('ACCOUNTS_DB_KEY')) throw error
        throw new Error(`Could not decrypt ${fieldName}. Check ACCOUNTS_DB_KEY.`)
    }
}

export function generateAccountsDbKey() {
    return crypto.randomBytes(32).toString('base64url')
}
