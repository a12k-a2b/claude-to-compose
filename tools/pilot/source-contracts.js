// Frozen identities for the two owner-supplied Claude Design artifacts.
// An edited artifact is a new reference and must be reviewed, not silently
// accepted as a passing comparison against old native screenshots.
const sourceContracts = {
  'da63f0b2-6919-408a-b3eb-68685f019fe6': {
    sourceTextSha256: 'cc3731bf6f0378e66011f209f0caeda86e541aaea3abbb3617ae075514ab6b93',
    sections: {}
  },
  'e34f4387-f506-4de5-bced-ef318d7f8bdf': {
    sourceTextSha256: 'ed3c4347330f5e1b876ec08d62f50fef413924e5d4af1a235337a8af604f2d7d',
    sections: {
      '6': 0, '6a': 0, '6b': 0, '6c': 0, '6d': 0,
      '1a': 3, '1b': 3, tb: 0, '2a': 2,
      '3a': 2, '3b': 2, '3c': 2,
      '4': 0, '4a': 0, '4b': 0, '4c': 0, '5': 6,
      explore: 0, g1: 0, g2: 3, g3: 0, g4: 2, g5: 1, g6: 2,
      mild: 0, m0: 0, m1: 2, m2: 0, m3: 0, m4: 2,
      presets: 1, cards: 0, snip: 0, small: 0, onboard: 0
    }
  }
};

function contractForUrl(value) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/code\/artifact\/([0-9a-f-]{36})$/);
  if (url.protocol !== 'https:' || url.hostname !== 'claude.ai' || url.search || url.hash
      || !match || !sourceContracts[match[1]]) {
    throw new Error('URL must be one of the two frozen owner-supplied Claude Design artifacts');
  }
  return { id: match[1], contract: sourceContracts[match[1]] };
}

module.exports = { sourceContracts, contractForUrl };
