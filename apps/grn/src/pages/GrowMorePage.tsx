import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Panel, SectionHeading } from '@olivias/ui';
import { getMe, listMyCrops } from '../services/api';
import { PlantLoader } from '../components/branding/PlantLoader';
import { resolveSeason } from '../components/Seasonality/seasonality';
import {
  GROW_MORE_PRACTICES,
  PRACTICE_THEMES,
  selectGrowMorePractices,
  type GrowMorePractice,
} from '../components/GrowMore/growMorePractices';
import { createLogger } from '../utils/logging';
import '../components/GrowMore/GrowMore.css';

const logger = createLogger('grow-more');

interface PracticeCardProps {
  practice: GrowMorePractice;
  reason?: string;
  expanded: boolean;
  onToggle: () => void;
  onFollowLink: (practice: GrowMorePractice) => void;
}

function PracticeCard({ practice, reason, expanded, onToggle, onFollowLink }: PracticeCardProps) {
  const theme = PRACTICE_THEMES[practice.theme];
  const detailId = `practice-detail-${practice.id}`;

  return (
    <li
      className={`grn-practice ${expanded ? 'is-expanded' : ''}`.trim()}
      style={{ '--practice-accent': theme.accent } as CSSProperties}
    >
      <div className="grn-practice__topline">
        <span className="grn-practice__theme">{theme.label}</span>
        <span className="grn-practice__effort">{practice.effort}</span>
      </div>
      <h3 className="grn-practice__title">{practice.title}</h3>
      <p className="grn-practice__summary">{practice.summary}</p>
      {reason ? <p className="grn-practice__reason">{reason}</p> : null}

      <button
        type="button"
        className="grn-practice__toggle"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        {expanded ? 'Show less' : 'How it works'}
      </button>

      {expanded ? (
        <div className="grn-practice__detail" id={detailId}>
          <p>{practice.detail}</p>
          <p className="grn-practice__opportunity">
            <span>What it opens up</span>
            {practice.opportunity}
          </p>
          <p className="grn-practice__first-step">
            <span>One small start</span>
            {practice.firstStep}
          </p>
          {practice.link ? (
            <Button variant="secondary" size="sm" onClick={() => onFollowLink(practice)}>
              {practice.link.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * A library of practices for growers who want their garden to feed them
 * further. Presented as opportunities to pick from — there is no progress bar,
 * no completion state, and no target, because self-sufficiency is a direction
 * some growers enjoy, not a goal the product sets for anyone.
 */
export function GrowMorePage() {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });

  const cropsQuery = useQuery({
    queryKey: ['myCrops'],
    queryFn: listMyCrops,
    staleTime: 60 * 1000,
  });

  // The library is worth reading whether or not we know whose garden it is,
  // but "worth a look this season" is only honest once both sources have
  // loaded: guessing a hemisphere would show a southern grower the opposite
  // season and then silently reorder the page underneath them.
  const isPersonalized = profileQuery.isSuccess && cropsQuery.isSuccess;
  const isPending = profileQuery.isPending || cropsQuery.isPending;
  const failedQueries = [profileQuery, cropsQuery].filter((query) => query.isError);

  const selection = useMemo(
    () =>
      isPersonalized
        ? selectGrowMorePractices({
            season: resolveSeason({ lat: profileQuery.data?.growerProfile?.lat }),
            crops: cropsQuery.data ?? [],
          })
        : null,
    [cropsQuery.data, isPersonalized, profileQuery.data?.growerProfile?.lat]
  );

  const libraryPractices = selection ? selection.rest : GROW_MORE_PRACTICES;

  const retryFailed = () => {
    void Promise.all(failedQueries.map((query) => query.refetch()));
  };

  const toggle = (practice: GrowMorePractice) => {
    setExpandedId((current) => {
      const next = current === practice.id ? null : practice.id;
      if (next) {
        logger.info('Grow more practice opened', {
          practiceId: practice.id,
          theme: practice.theme,
          season: selection?.season ?? null,
        });
      }
      return next;
    });
  };

  const followLink = (practice: GrowMorePractice) => {
    if (!practice.link) return;
    logger.info('Grow more practice link followed', {
      practiceId: practice.id,
      destination: practice.link.to,
    });
    navigate(practice.link.to);
  };

  return (
    <section className="grn-section grn-grow-more">
      <SectionHeading
        title="Grow more of your own"
        body="Practices that help a garden feed you further. Take whichever ones sound good and ignore the rest — there is no target here, and nothing on this page is tracked."
      />

      {isPending ? (
        <Panel className="grn-page-status">
          <PlantLoader size="sm" />
          <p>Looking at your season and your garden…</p>
        </Panel>
      ) : null}

      {failedQueries.length > 0 ? (
        <div className="grn-today-notice grn-today-notice--warning" role="alert">
          <span>
            Your garden details could not load, so nothing below is tailored to your season. The
            practices themselves are all still here.
          </span>
          <Button variant="ghost" size="sm" onClick={retryFailed}>
            Try again
          </Button>
        </div>
      ) : null}

      {selection && selection.timely.length > 0 ? (
        <section className="grn-grow-more__group" aria-labelledby="grow-more-timely-heading">
          <div className="grn-grow-more__group-head">
            <h2 id="grow-more-timely-heading">Worth a look this season</h2>
            <p>Chosen from your season and what is already in your garden.</p>
          </div>
          <ul className="grn-practice-grid">
            {selection.timely.map(({ practice, reason }) => (
              <PracticeCard
                key={practice.id}
                practice={practice}
                reason={reason}
                expanded={expandedId === practice.id}
                onToggle={() => toggle(practice)}
                onFollowLink={followLink}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grn-grow-more__group" aria-labelledby="grow-more-library-heading">
        <div className="grn-grow-more__group-head">
          <h2 id="grow-more-library-heading">
            {selection ? 'The rest of the library' : 'The library'}
          </h2>
          <p>Everything here keeps. Come back whenever one of them becomes interesting.</p>
        </div>
        <ul className="grn-practice-grid">
          {libraryPractices.map((practice) => (
            <PracticeCard
              key={practice.id}
              practice={practice}
              expanded={expandedId === practice.id}
              onToggle={() => toggle(practice)}
              onFollowLink={followLink}
            />
          ))}
        </ul>
      </section>

      <p className="grn-grow-more__footnote">
        Growing all of your own food is not the point of Good Roots, and a garden that covers one
        salad a week is a good garden. These are simply opportunities, here when you want them.
      </p>
    </section>
  );
}

export default GrowMorePage;
