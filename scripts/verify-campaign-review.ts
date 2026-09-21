import assert from 'node:assert/strict';
import { presentCandidate } from '@/lib/campaign/presentation';
import type { Candidate } from '@/lib/data/campaigns';
import type { ChannelReportView } from '@/lib/channel/report';
import type { AnalysisJob } from '@/types';

const candidate: Candidate = {
  id: 'candidate',
  channelId: 'channel',
  submittedAs: '@test',
  status: 'shortlisted',
  proposedFee: 0,
  feeCurrency: 'USD',
  notes: 'private',
  fit: null,
  fitModel: null,
  fitWrittenAt: null,
  addedAt: new Date().toISOString(),
  analysis: null,
};
const report: ChannelReportView = {
  channelId: 'channel',
  title: 'Test',
  handle: '@test',
  avatar: null,
  description: null,
  subscribers: null,
  fetchedAt: new Date().toISOString(),
  requestedStart: null,
  requestedEnd: null,
  sampledStart: null,
  sampledEnd: null,
  windowDays: 90,
  videos: [],
  comments: 0,
  unreadable: 0,
  truncated: false,
  promotions: [],
  contentProfile: null,
  clusters: [],
  derivedAllowed: false,
  analysedAt: null,
};
const job = (status: AnalysisJob['status']): AnalysisJob => ({
  id: status,
  kind: 'collect_channel',
  status,
  attempts: 1,
  maxAttempts: 3,
  queuedAt: '',
  startedAt: null,
  finishedAt: null,
  commentsScanned: null,
  findings: null,
  lastError: 'SECRET-WORKER-ERROR',
  progressDone: null,
  progressTotal: null,
  progressStage: null,
});

assert.equal(presentCandidate(candidate, [], null).state, 'missing');
assert.equal(
  presentCandidate(candidate, [job('queued')], null).state,
  'queued',
);
assert.equal(
  presentCandidate(candidate, [job('running'), job('failed')], report).state,
  'running',
);
assert.equal(
  presentCandidate(candidate, [job('failed')], null).state,
  'failed',
);
assert.equal(
  presentCandidate(candidate, [job('failed')], report).state,
  'partial',
);
assert.equal(presentCandidate(candidate, [], report).state, 'ready');
assert.match(
  presentCandidate(candidate, [], report).summary,
  /0 sampled videos/,
);
assert.equal(
  presentCandidate(candidate, [job('failed')], null).candidate.status,
  'shortlisted',
);
assert.ok(
  !JSON.stringify(presentCandidate(candidate, [job('failed')], null)).includes(
    'SECRET-WORKER-ERROR',
  ),
);

const insufficient: Candidate = {
  ...candidate,
  fit: {
    verdict: 'Unknown',
    relevance: 'Potential overlap',
    audienceSignal: '',
    sponsorshipRead: '',
    brandRisk: '',
    suggestedAngles: [],
    beforeYouSign: [],
    confidence: 'insufficient',
    confidenceReason: 'Too little evidence',
  },
};
assert.equal(
  presentCandidate(insufficient, [], report).summary,
  'Not enough evidence for a campaign assessment.',
);
assert.equal(
  presentCandidate(insufficient, [job('failed')], null).summary,
  'Analysis could not be completed.',
);
const supported: Candidate = {
  ...insufficient,
  fit: {
    ...insufficient.fit!,
    confidence: 'supported',
    relevance: 'Verified topic overlap',
  },
};
assert.equal(
  presentCandidate(supported, [], report).summary,
  'Verified topic overlap',
);
assert.equal(
  presentCandidate(supported, [job('queued')], report).summary,
  'Waiting for analysis.',
);
assert.equal(candidate.proposedFee, 0);
assert.equal(candidate.status, 'shortlisted');
console.log(
  'Campaign review: missing, queued, running, failed, partial, zero evidence, insufficient assessment, independent decisions and worker-error privacy passed.',
);
