# Kleurenwiezen

Browser version of the Flemish trick-taking card game *kleurenwiezen*. You can play it solo against bots or online with friends. There is no game server: the whole app is static files, and online games run peer-to-peer.

- **Online play without a backend.** The host's browser runs the game. Friends join with a link or a 5-letter code. The browsers talk directly over WebRTC ([PeerJS](https://peerjs.com)); the free public PeerJS server is only used to find each other.
- **Bots** fill every empty seat. Friends can join mid-game and take over a bot. If a player drops out, a bot plays for them until they come back; reloading the page puts them back in their seat.
- **Rules**: ask & join, alone, troel, piccolo (can be switched off), abondance, misère, open misère and solo slim. The rules and scoring are explained in the app (📖).
- **NL / EN** language switcher, **dark mode**, a responsive layout for phones, and animations for dealing, playing cards and collecting tricks.
- **Sound effects** for shuffling and dealing, playing a card, sweeping up a trick, bids, your turn (online), and winning or losing a hand. They are synthesised with the Web Audio API, so there are no audio files, and you can mute them in the top bar.
- A solo game survives a page reload ("Resume your game").

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine, scoring and bot tests (vitest)
npm run build      # static build in dist/
```

Browser smoke tests use Playwright with the locally installed Chrome. Start the dev server on port 5199 first:

```bash
npx vite --port 5199 --host 127.0.0.1
npm run smoke          # full solo games (desktop light/EN, mobile dark/NL)
npm run smoke:online   # host + guest over WebRTC, disconnect/rejoin, host leaving
```

## Deploying

`npm run build` produces a fully static `dist/` with relative paths, so it works on any static host or sub-folder. The included GitHub Actions workflow (`.github/workflows/deploy.yml`) publishes to GitHub Pages on every push to `main`. To turn it on, set *Settings → Pages → Source* to *GitHub Actions*.

## Code layout

| Path | What |
| --- | --- |
| `src/game/cards.ts` | Cards, dealing (4-4-5), trick winner |
| `src/game/rules.ts` | Contract definitions and zero-sum scoring |
| `src/game/engine.ts` | Pure state machine: bidding, play, hand end |
| `src/game/bot.ts` | Bot bidding and card play; bots only see their own `PlayerView` |
| `src/game/view.ts` | Per-player redacted view (hides the other players' cards) |
| `src/net/host.ts` | Authoritative game host: validates actions, drives bots and timers |
| `src/net/session.ts` | Local, online-host and guest sessions (PeerJS) |
| `src/ui/*` | React UI (table, bidding, results, rules, lobby) |
| `src/i18n/*` | Dutch and English texts |

## Scoring

| Contract | Players | Tricks | Value |
| --- | --- | --- | --- |
| Ask & join (vragen & meegaan) | 2 vs 2 | 8 | 2, +1 per overtrick |
| Alone (alleen) | 1 vs 3 | 5 | 3, +1 per overtrick |
| Troel | 2 vs 2 | 8 | 4, +1 per overtrick |
| Piccolo | 1 vs 3 | exactly 1 | 5 |
| Abondance | 1 vs 3 | 9 (own trump) | 6 |
| Misère | 1 vs 3 | 0 | 7 |
| Open misère | 1 vs 3 | 0 (cards open) | 14 |
| Solo slim | 1 vs 3 | 13 (own trump) | 25 |

In 2 vs 2 contracts each player wins or loses the value. In 1 vs 3 contracts the declarer wins or loses the value from each opponent, so 3×. Missing tricks cost 1 extra point each, and taking all 13 tricks doubles the score. When everybody passes, the same dealer deals again and the next hand counts double; this can be switched off.
