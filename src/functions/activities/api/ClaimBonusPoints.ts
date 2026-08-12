import { Workers } from '../../Workers'

export interface ClaimBonusResult {
    attempts: number
    acknowledged: number
    pointsGained: number
    exhausted: boolean
}

export class ClaimBonusPoints extends Workers {
    /**
     * Drain every points bucket exposed by the Rewards "Ready to claim" banner.
     *
     * `reportClaimAllPoints` normally empties the banner in one request, but the
     * service can expose newly-ready buckets immediately after the first claim.
     * Keep claiming while the balance increases and finish with one no-op pass
     * that proves the banner is exhausted. The hard limit prevents a changed
     * upstream response from creating an infinite loop.
     */
    public async claimBonusPoints(maxAttempts = 5): Promise<ClaimBonusResult> {
        const result: ClaimBonusResult = {
            attempts: 0,
            acknowledged: 0,
            pointsGained: 0,
            exhausted: false
        }
        const actionId = this.bot.nextActions.reportClaimAllPoints
        if (!actionId) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'CLAIM-BONUS-POINTS',
                'Skipping: "reportClaimAllPoints" action id not discovered in bundle'
            )
            return result
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'CLAIM-BONUS-POINTS',
            `Draining all Ready to claim points | geo=${this.bot.userData.geoLocale} | currentBalance=${this.bot.userData.currentPoints}`
        )

        for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
            const oldBalance = this.bot.userData.currentPoints

            try {
                const { status, acknowledged } = await this.bot.browser.func.reportServerAction(actionId, [])
                result.attempts++
                if (acknowledged) result.acknowledged++

                const newBalance = await this.bot.browser.func.getCurrentPoints()
                const gainedPoints = Math.max(0, newBalance - oldBalance)

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'CLAIM-BONUS-POINTS',
                    `Claim pass ${attempt} | status=${status} | acknowledged=${acknowledged} | previousBalance=${oldBalance} | currentBalance=${newBalance} | pointsGained=${gainedPoints}`
                )

                if (!acknowledged || gainedPoints <= 0) {
                    this.bot.userData.currentPoints = newBalance
                    result.exhausted = true
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'CLAIM-BONUS-POINTS',
                        `Ready to claim exhausted | attempts=${result.attempts} | pointsGained=${result.pointsGained} | currentBalance=${newBalance}`,
                        result.pointsGained > 0 ? 'green' : undefined
                    )
                    break
                }

                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints
                result.pointsGained += gainedPoints

                this.bot.logger.info(
                    this.bot.isMobile,
                    'CLAIM-BONUS-POINTS',
                    `Claimed Ready to claim pass ${attempt} | pointsGained=${gainedPoints} | totalClaimed=${result.pointsGained} | currentBalance=${newBalance}`,
                    'green'
                )

                await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 5000))
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'CLAIM-BONUS-POINTS',
                    `Error draining Ready to claim on pass ${attempt} | message=${error instanceof Error ? error.message : String(error)}`
                )
                break
            }
        }

        if (!result.exhausted && result.attempts >= Math.max(1, maxAttempts)) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'CLAIM-BONUS-POINTS',
                `Ready to claim safety limit reached | attempts=${result.attempts} | pointsGained=${result.pointsGained}`
            )
        }

        return result
    }
}
