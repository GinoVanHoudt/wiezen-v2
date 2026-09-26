import { CONTRACTS, type ContractType } from '../game/rules';
import { useI18n } from '../i18n';
import { Modal } from './Modal';
import { contractName } from './format';

const ORDER: ContractType[] = ['samen', 'alleen', 'troel', 'piccolo', 'abondance', 'miserie', 'openMiserie', 'soloSlim'];

const TEXT = {
  nl: {
    intro:
      'Kleurenwiezen speel je met vier spelers en een volledig spel van 52 kaarten. Aas is hoog, 2 is laag. Elk spel bestaat uit bieden en daarna 13 slagen spelen.',
    dealTitle: 'Delen',
    deal: 'De gever deelt kloksgewijs 4, 4 en 5 kaarten, te beginnen bij de speler links van de gever. Na elk spel schuift de gever een plaats op.',
    bidTitle: 'Bieden',
    bid: [
      'De speler links van de gever spreekt eerst. Om de beurt pas je, of bied je hoger dan het huidige bod. Wie past, doet niet meer mee aan het bieden.',
      'Vragen: je vraagt een kleur als troef en zoekt een partner. Een andere speler kan meegaan; samen moeten jullie 8 slagen halen.',
      'Gaat niemand mee, dan mag de vrager alleen spelen voor 5 slagen, of passen.',
      'Troel: wie 3 azen heeft, speelt automatisch troel samen met de houder van de vierde aas (die kleur is troef). Met 4 azen is harten troef en is de houder van de hoogste ontbrekende harten de partner.',
      'Miserie, open miserie en piccolo mogen door meerdere spelers tegelijk gespeeld worden ("ik ook"); elke speler wordt apart afgerekend.',
      'Past iedereen, dan deelt dezelfde gever opnieuw en telt het volgende spel dubbel (als die regel aan staat).',
    ],
    contractsTitle: 'Spellen (van laag naar hoog)',
    desc: {
      samen: '2 tegen 2, 8 slagen met de gevraagde troef.',
      alleen: '1 tegen 3, 5 slagen met de gevraagde troef.',
      troel: '2 tegen 2, 8 slagen. De troelspeler en de houder van de vierde aas.',
      piccolo: '1 tegen 3, precies 1 slag, zonder troef.',
      abondance: '1 tegen 3, 9 slagen met zelfgekozen troef. De speler komt zelf uit.',
      miserie: '1 tegen 3, geen enkele slag halen, zonder troef.',
      openMiserie: 'Zoals miserie, maar je kaarten liggen open op tafel zodra het spelen begint.',
      soloSlim: '1 tegen 3, alle 13 slagen met zelfgekozen troef. De speler komt zelf uit.',
    } as Record<ContractType, string>,
    playTitle: 'Spelen',
    play: [
      'De speler links van de gever komt uit (bij abondance en solo slim de speler zelf). Je moet kleur bekennen als je kan; anders mag je om het even welke kaart spelen. Troeven is niet verplicht.',
      'De hoogste troef wint de slag, anders de hoogste kaart van de gevraagde kleur. Wie de slag wint, komt uit.',
      'Staat de uitslag van een spel met vaste punten al vast (bv. een miseriespeler heeft een slag), dan stopt het spel vroeger.',
    ],
    scoreTitle: 'Puntentelling',
    score: [
      'De punten zijn altijd in evenwicht: wat de ene kant wint, verliest de andere.',
      '2 tegen 2: elke speler van het koppel wint (of verliest) de waarde, elke tegenstander verliest (of wint) evenveel.',
      '1 tegen 3: de speler wint (of verliest) de waarde van elke tegenstander, dus 3× de waarde.',
      'Bij vragen, alleen en troel komt er 1 punt bij per extra slag, en kost elke slag te weinig 1 punt extra. Alle 13 slagen halen verdubbelt de punten.',
    ],
    colContract: 'Spel',
    colTricks: 'Slagen',
    colPoints: 'Waarde',
    colPlayers: 'Spelers',
    exactly: 'precies',
    perTrick: '+1 per extra slag',
    team: '2 tegen 2',
    solo: '1 tegen 3',
    optional: '(optioneel)',
  },
  en: {
    intro:
      'Kleurenwiezen (colour whist) is played by four players with a full 52-card deck. Ace is high, 2 is low. Every hand consists of an auction followed by 13 tricks.',
    dealTitle: 'Dealing',
    deal: 'The dealer deals clockwise in packets of 4, 4 and 5 cards, starting with the player to their left. The deal passes to the left after every hand.',
    bidTitle: 'Bidding',
    bid: [
      'The player left of the dealer speaks first. In turn you pass, or bid higher than the current bid. Once you pass you are out of the auction.',
      'Ask: you propose a trump suit and look for a partner. Another player can join; together you must take 8 tricks.',
      'If nobody joins, the asker may play alone for 5 tricks, or pass.',
      'Troel: a player with 3 aces automatically plays troel with the holder of the fourth ace (that suit is trump). With 4 aces hearts are trump and the holder of the highest missing heart is the partner.',
      'Misère, open misère and piccolo can be played by several players at once ("me too"); each of them is settled separately.',
      'If everybody passes, the same dealer deals again and the next hand counts double (when that table rule is on).',
    ],
    contractsTitle: 'Contracts (low to high)',
    desc: {
      samen: '2 vs 2, 8 tricks with the asked trump suit.',
      alleen: '1 vs 3, 5 tricks with the asked trump suit.',
      troel: '2 vs 2, 8 tricks. The troel player and the holder of the fourth ace.',
      piccolo: '1 vs 3, exactly 1 trick, no trump.',
      abondance: '1 vs 3, 9 tricks with a trump suit of your choice. You lead the first trick.',
      miserie: '1 vs 3, take no tricks at all, no trump.',
      openMiserie: 'Like misère, but your cards are shown face up once play starts.',
      soloSlim: '1 vs 3, all 13 tricks with a trump suit of your choice. You lead the first trick.',
    } as Record<ContractType, string>,
    playTitle: 'Play',
    play: [
      'The player left of the dealer leads (for abondance and solo slim the declarer does). You must follow suit if you can; otherwise you may play any card. You are never obliged to trump.',
      'The highest trump wins the trick, otherwise the highest card of the suit led. The winner of a trick leads the next one.',
      'When the result of a fixed-score contract is already certain (e.g. a misère player took a trick), the hand ends early.',
    ],
    scoreTitle: 'Scoring',
    score: [
      'Scores always balance: whatever one side wins, the other side loses.',
      '2 vs 2: each partner wins (or loses) the value, each opponent loses (or wins) the same.',
      '1 vs 3: the declarer wins (or loses) the value from each opponent, so 3× the value.',
      'Ask & join, alone and troel earn 1 extra point per overtrick and cost 1 extra point per missing trick. Taking all 13 tricks doubles the score.',
    ],
    colContract: 'Contract',
    colTricks: 'Tricks',
    colPoints: 'Value',
    colPlayers: 'Players',
    exactly: 'exactly',
    perTrick: '+1 per overtrick',
    team: '2 vs 2',
    solo: '1 vs 3',
    optional: '(optional)',
  },
};

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, t } = useI18n();
  const x = TEXT[lang];
  return (
    <Modal open={open} onClose={onClose} title={t('rules')} wide>
      <div className="rules">
        <p>{x.intro}</p>
        <h3>{x.dealTitle}</h3>
        <p>{x.deal}</p>
        <h3>{x.bidTitle}</h3>
        <ul>
          {x.bid.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <h3>{x.contractsTitle}</h3>
        <div className="table-scroll">
          <table className="rules-table">
            <thead>
              <tr>
                <th>{x.colContract}</th>
                <th>{x.colPlayers}</th>
                <th>{x.colTricks}</th>
                <th>{x.colPoints}</th>
              </tr>
            </thead>
            <tbody>
              {ORDER.map((type) => {
                const def = CONTRACTS[type];
                return (
                  <tr key={type}>
                    <td>
                      <strong>{contractName(type, t)}</strong> {type === 'piccolo' && <em>{x.optional}</em>}
                      <div className="muted small">{x.desc[type]}</div>
                    </td>
                    <td>{def.kind === 'team' ? x.team : x.solo}</td>
                    <td>{def.exact ? `${x.exactly} ${def.target}` : def.target}</td>
                    <td>
                      {def.base}
                      {def.perTrick && <div className="muted small">{x.perTrick}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3>{x.playTitle}</h3>
        <ul>
          {x.play.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <h3>{x.scoreTitle}</h3>
        <ul>
          {x.score.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
