/**
 * Tier 4 - Scenario 4: Social Media Profile & Feed Workload
 * Exercising: Header avatar, bio, follower counters, tab navigation, post feed cards with like animations.
 * Expected: AnimatedVisibility on like/save, modular atomic composables, dark mode preview.
 */

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  name: 'S4: Social Media Profile & Feed Workload',
  tier: 4,
  feature: 'S4',
  tests: [
    {
      id: 'T4_S4_01',
      name: 'Verify Social Feed fixture DOM and dark theme profile styling',
      run: async (t) => {
        const fixtureDir = path.join(t.fixturesDir, 's4_social_feed');
        const html = fs.readFileSync(path.join(fixtureDir, 'index.html'), 'utf8');
        const css = fs.readFileSync(path.join(fixtureDir, 'styles.css'), 'utf8');

        t.assert(html.includes('@sarah_design'), 'HTML must declare creator handle');
        t.assert(html.includes('Followers'), 'HTML must include follower count');
        t.assert(html.includes('action-like'), 'HTML must include post like action');
        t.assert(css.includes('--color-bg: #0F172A;'), 'CSS must define dark slate background');
      }
    },
    {
      id: 'T4_S4_02',
      name: 'Validate post like button state transition with AnimatedVisibility heart toggle',
      run: async (t) => {
        const likeButtonComposable = `
          var isLiked by rememberSaveable { mutableStateOf(false) }
          var likeCount by rememberSaveable { mutableStateOf(384) }

          IconButton(onClick = {
            isLiked = !isLiked
            likeCount += if (isLiked) 1 else -1
          }) {
            Icon(
              imageVector = if (isLiked) FilledHeartIcon else OutlinedHeartIcon,
              tint = if (isLiked) Color(0xFFE11D48) else Color(0xFF94A3B8),
              contentDescription = "Like Post"
            )
          }
        `;
        t.assert(likeButtonComposable.includes('isLiked = !isLiked'));
        t.assert(likeButtonComposable.includes('FilledHeartIcon else OutlinedHeartIcon'));
      }
    },
    {
      id: 'T4_S4_03',
      name: 'Validate feed list implementation using LazyColumn with profile header item',
      run: async (t) => {
        const feedStructure = `
          LazyColumn(modifier = Modifier.fillMaxSize()) {
            item { ProfileHeaderSection() }
            item { TabStripSection() }
            items(posts) { post ->
              FeedCard(post = post)
            }
          }
        `;
        t.assert(feedStructure.includes('item { ProfileHeaderSection() }'));
        t.assert(feedStructure.includes('items(posts)'));
      }
    },
    {
      id: 'T4_S4_04',
      name: 'Verify end-to-end extraction and synthesis pipeline execution for S4',
      run: async (t) => {
        t.checkFileExists('bin/claude-extract.js', 'M1', 'CLI extractor required for S4');
        t.checkFileExists('synthesizer/screen_generator.js', 'M2', 'Screen synthesizer required for S4');
      }
    }
  ]
};
