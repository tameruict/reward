import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../../index'

export class EmailLogin {
    private readonly emailInput = 'input#usernameEntry, input[name="loginfmt"], input[type="email"]'
    private readonly passwordInput = 'input[name="passwd"], input[type="password"]'
    private readonly submitButton = 'button[data-testid="primaryButton"], button[type="submit"]'

    constructor(private bot: MicrosoftRewardsBot) {}

    async enterEmail(page: Page, email: string): Promise<'ok' | 'retry' | 'error'> {
        try {
            const emailField = await page
                .waitForSelector(this.emailInput, { state: 'visible', timeout: 1500 })
                .catch(() => null)
            if (!emailField) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-ENTER-EMAIL',
                    'Email field disappeared before entry; login state will be checked again'
                )
                return 'retry'
            }

            await this.bot.utils.wait(250)

            const currentEmail = await page.inputValue(this.emailInput).catch(() => '')
            if (currentEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
                await page.fill(this.emailInput, '')
                await this.bot.utils.wait(150)
                await page.fill(this.emailInput, email)
                await this.bot.utils.wait(250)
            } else {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-ENTER-EMAIL', 'Email prefilled')
            }

            const enteredEmail = await page.inputValue(this.emailInput).catch(() => '')
            if (enteredEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-ENTER-EMAIL', 'Email value could not be verified')
                return 'error'
            }

            const submitButton = await page
                .waitForSelector(this.submitButton, { state: 'visible', timeout: 2500 })
                .catch(() => null)
            if (!submitButton) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-ENTER-EMAIL', 'Email submit button not found')
                return 'error'
            }

            const clicked = await this.bot.browser.utils.ghostClick(page, this.submitButton)
            if (!clicked) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-ENTER-EMAIL', 'Email submit button could not be clicked')
                return 'error'
            }
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-ENTER-EMAIL', 'Email submitted')

            return 'ok'
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-ENTER-EMAIL',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            return 'error'
        }
    }

    async enterPassword(page: Page, password: string): Promise<'ok' | 'retry' | 'error'> {
        try {
            const passwordField = await page
                .waitForSelector(this.passwordInput, { state: 'visible', timeout: 1500 })
                .catch(() => null)
            if (!passwordField) {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'LOGIN-ENTER-PASSWORD',
                    'Password field disappeared before entry; login state will be checked again'
                )
                return 'retry'
            }

            await this.bot.utils.wait(250)
            await page.fill(this.passwordInput, '')
            await this.bot.utils.wait(150)
            await page.fill(this.passwordInput, password)
            await this.bot.utils.wait(250)

            const enteredPassword = await page.inputValue(this.passwordInput).catch(() => '')
            if (enteredPassword !== password) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-ENTER-PASSWORD', 'Password value could not be verified')
                return 'error'
            }

            const submitButton = await page
                .waitForSelector(this.submitButton, { state: 'visible', timeout: 2000 })
                .catch(() => null)

            if (!submitButton) {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-ENTER-PASSWORD', 'Password submit button not found')
                return 'error'
            }

            const clicked = await this.bot.browser.utils.ghostClick(page, this.submitButton)
            if (!clicked) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'LOGIN-ENTER-PASSWORD',
                    'Password submit button could not be clicked'
                )
                return 'error'
            }
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-ENTER-PASSWORD', 'Password submitted')

            return 'ok'
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-ENTER-PASSWORD',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
            )
            return 'error'
        }
    }
}
