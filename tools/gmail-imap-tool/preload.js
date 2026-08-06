'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
    // Accounts
    listAccounts: () => ipcRenderer.invoke('accounts:list'),
    deleteAccount: email => ipcRenderer.invoke('accounts:delete', email),
    saveAccount: payload => ipcRenderer.invoke('accounts:save', payload),
    saveAppPassword: (email, appPassword) => ipcRenderer.invoke('accounts:save', { email, appPassword }),
    clearAccountProxy: email => ipcRenderer.invoke('accounts:clearProxy', email),

    // Microsoft Rewards
    listRewardsAccounts: () => ipcRenderer.invoke('rewards:listAccounts'),
    saveRewardsAccount: payload => ipcRenderer.invoke('rewards:saveAccount', payload),
    openRewards: email => ipcRenderer.invoke('rewards:open', { email }),
    deleteRewardsAccount: email => ipcRenderer.invoke('rewards:deleteAccount', email),

    // Activation
    activate: (email, proxy) => ipcRenderer.invoke('activate:start', { email, proxy }),
    openImapSettings: email => ipcRenderer.invoke('activate:openImapSettings', { email }),
    onActivateStatus: cb => {
        const handler = (_e, s) => cb(s)
        ipcRenderer.on('activate:status', handler)
        return () => ipcRenderer.removeListener('activate:status', handler)
    },

    // IMAP reading
    verify: payload => ipcRenderer.invoke('imap:verify', payload),
    listInbox: payload => ipcRenderer.invoke('imap:list', payload),
    readMessage: payload => ipcRenderer.invoke('imap:read', payload),
    getOtp: payload => ipcRenderer.invoke('imap:otp', payload)
})
