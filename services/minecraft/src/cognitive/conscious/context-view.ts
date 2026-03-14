import type { ReflexContextState } from '../reflex/context'

export interface ConsciousContextView {
  selfSummary: string
  environmentSummary: string
}

export function buildConsciousContextView(ctx: ReflexContextState): ConsciousContextView {
  const pos = ctx.self.location
  const roundedPos = `(${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`
  const followState = ctx.autonomy.followPlayer
    ? ` Auto-follow target ${ctx.autonomy.followPlayer} (${ctx.autonomy.followActive ? 'active' : 'paused'})`
    : ' Auto-follow disabled'
  const autonomyState = [
    ctx.autonomy.enabled ? 'Self-direction enabled' : 'Self-direction disabled',
    ctx.autonomy.ownerPlayerName ? `Owner ${ctx.autonomy.ownerPlayerName}` : 'No owner set',
    ctx.autonomy.currentGoal ? `Current goal ${ctx.autonomy.currentGoal}` : 'No current goal',
    ctx.autonomy.homeAnchor
      ? `Home (${ctx.autonomy.homeAnchor.x}, ${ctx.autonomy.homeAnchor.y}, ${ctx.autonomy.homeAnchor.z})`
      : 'No home anchor',
    ctx.autonomy.lastAutonomyReason ? `Last autonomy reason ${ctx.autonomy.lastAutonomyReason}` : 'No recent autonomy turn',
  ].join('. ')
  const selfSummary = `Position ${roundedPos} Health ${ctx.self.health}/20 Food ${ctx.self.food}/20 and I'm holding ${ctx.self.holding ?? 'nothing'}.${followState} ${autonomyState}.`

  const players = ctx.environment.nearbyPlayers
    .map(p => (p.holding ? `${p.name} is holding (${p.holding})` : p.name))
    .join(',')
  const entities = ctx.environment.nearbyEntities.map(e => e.name).join(',')

  const environmentSummary = `${ctx.environment.time} ${ctx.environment.weather} Nearby players [${players}] Nearby entities [${entities}] Light ${ctx.environment.lightLevel}`

  return {
    selfSummary,
    environmentSummary,
  }
}
