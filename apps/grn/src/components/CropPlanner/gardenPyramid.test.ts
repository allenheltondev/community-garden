import { describe, expect, it } from 'vitest';
import {
  PYRAMID_TIERS,
  bucketCropsByTier,
  classifyCropToTier,
  tierMeta,
  type PyramidTier,
} from './gardenPyramid';

describe('classifyCropToTier', () => {
  it('places calorie staples in the Foundation layer', () => {
    expect(classifyCropToTier('Potato')).toBe(1);
    expect(classifyCropToTier('Sweet potato')).toBe(1);
    expect(classifyCropToTier('Yukon Gold potatoes')).toBe(1);
    expect(classifyCropToTier('Garlic')).toBe(1);
    expect(classifyCropToTier('Yellow onion')).toBe(1);
  });

  it('places everyday vegetables in the Workhorse layer', () => {
    expect(classifyCropToTier('Tomato')).toBe(2);
    expect(classifyCropToTier('Bell pepper')).toBe(2);
    expect(classifyCropToTier('Cucumber')).toBe(2);
    expect(classifyCropToTier('Carrot')).toBe(2);
    expect(classifyCropToTier('Zucchini')).toBe(2);
  });

  it('places fast greens in the Fresh layer', () => {
    expect(classifyCropToTier('Lettuce')).toBe(3);
    expect(classifyCropToTier('Spinach')).toBe(3);
    expect(classifyCropToTier('Kale')).toBe(3);
    expect(classifyCropToTier('Radish')).toBe(3);
    expect(classifyCropToTier('Bok choy')).toBe(3);
  });

  it('places herbs in the Flavor layer', () => {
    expect(classifyCropToTier('Cilantro')).toBe(4);
    expect(classifyCropToTier('Dill')).toBe(4);
    expect(classifyCropToTier('Flat-leaf parsley')).toBe(4);
    expect(classifyCropToTier('Fennel')).toBe(4);
    expect(classifyCropToTier('Basil')).toBe(4);
  });

  it('places berries and treats in the Joy layer', () => {
    expect(classifyCropToTier('Strawberry')).toBe(5);
    expect(classifyCropToTier('Blueberries')).toBe(5);
    expect(classifyCropToTier('Raspberry')).toBe(5);
    expect(classifyCropToTier('Concord grapes')).toBe(5);
    expect(classifyCropToTier('Watermelon')).toBe(5);
  });

  describe('ambiguous names resolve to the most likely layer', () => {
    it('treats winter squash as Foundation but summer squash/zucchini as Workhorse', () => {
      expect(classifyCropToTier('Butternut squash')).toBe(1);
      expect(classifyCropToTier('Winter squash')).toBe(1);
      expect(classifyCropToTier('Squash')).toBe(1); // bare name → winter staple
      expect(classifyCropToTier('Summer squash')).toBe(2);
      expect(classifyCropToTier('Yellow squash')).toBe(2);
    });

    it('treats dry beans as Foundation but fresh/plain beans as Workhorse', () => {
      expect(classifyCropToTier('Dry beans')).toBe(1);
      expect(classifyCropToTier('Kidney bean')).toBe(1);
      expect(classifyCropToTier('Green beans')).toBe(2);
      expect(classifyCropToTier('Beans')).toBe(2); // bare name → fresh
    });

    it('separates storage onions from scallions/green onions', () => {
      expect(classifyCropToTier('Onion')).toBe(1);
      expect(classifyCropToTier('Green onion')).toBe(3);
      expect(classifyCropToTier('Scallions')).toBe(3);
    });
  });

  it('falls back to category when the name does not match', () => {
    expect(classifyCropToTier('Some mystery plant', 'herb')).toBe(4);
    expect(classifyCropToTier('Unknown thing', 'berry')).toBe(5);
    expect(classifyCropToTier('Unknown veg', 'vegetable')).toBe(2);
    expect(classifyCropToTier('Mystery grain', 'grain')).toBe(1);
  });

  it('returns null when nothing matches', () => {
    expect(classifyCropToTier('Quux')).toBeNull();
    expect(classifyCropToTier(null, null)).toBeNull();
    expect(classifyCropToTier('Quux', 'unknown-category')).toBeNull();
  });
});

describe('PYRAMID_TIERS', () => {
  it('defines exactly five tiers ordered Foundation → Joy', () => {
    expect(PYRAMID_TIERS).toHaveLength(5);
    expect(PYRAMID_TIERS.map((t) => t.level)).toEqual([1, 2, 3, 4, 5]);
  });

  it('exposes metadata for each level via tierMeta', () => {
    ([1, 2, 3, 4, 5] as PyramidTier[]).forEach((level) => {
      const meta = tierMeta(level);
      expect(meta.level).toBe(level);
      expect(meta.name).toBeTruthy();
      expect(meta.suggestions.length).toBeGreaterThan(0);
    });
  });
});

describe('bucketCropsByTier', () => {
  it('groups crops into their layers and collects the unplaceable ones', () => {
    const crops = [
      { cropName: 'Potato' },
      { cropName: 'Tomato' },
      { cropName: 'Lettuce' },
      { cropName: 'Basil' },
      { cropName: 'Strawberry' },
      { cropName: 'Mystery plant' },
    ];

    const { tiers, unsorted } = bucketCropsByTier(crops);

    expect(tiers[1].map((c) => c.cropName)).toEqual(['Potato']);
    expect(tiers[2].map((c) => c.cropName)).toEqual(['Tomato']);
    expect(tiers[3].map((c) => c.cropName)).toEqual(['Lettuce']);
    expect(tiers[4].map((c) => c.cropName)).toEqual(['Basil']);
    expect(tiers[5].map((c) => c.cropName)).toEqual(['Strawberry']);
    expect(unsorted.map((c) => c.cropName)).toEqual(['Mystery plant']);
  });

  it('returns empty buckets for an empty input', () => {
    const { tiers, unsorted } = bucketCropsByTier([]);
    expect(unsorted).toEqual([]);
    ([1, 2, 3, 4, 5] as PyramidTier[]).forEach((level) => {
      expect(tiers[level]).toEqual([]);
    });
  });
});
