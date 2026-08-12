import crypto from 'crypto'

const PREFIX = 'enc:v1:'

function masterKey(): string {
    const key = process.env.ACCOUNTS_DB_KEY?.trim()
    if (!key) throw new Error('ACCOUNTS_DB_KEY is required to decrypt account database credentials.')
    return key
}

export function decryptAccountSecret(value: string | null, fieldName: string): string {
    const stored = value ?? ''
    if (!stored.startsWith(PREFIX)) return stored

    const parts = stored.slice(PREFIX.length).split(':')
    if (parts.length !== 4) throw new Error(`Invalid encrypted ${fieldName} format in account database.`)

    try {
        const [saltValue, ivValue, tagValue, encryptedValue] = parts as [string, string, string, string]
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
