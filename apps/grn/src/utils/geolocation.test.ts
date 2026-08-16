import { describe, expect, it } from 'vitest';
import { postcodeFromAddress } from './geolocation';

describe('postcodeFromAddress', () => {
  it('reads the zipcode off a typed US address', () => {
    expect(postcodeFromAddress('900 Cedar Ave, Austin, TX 78701')).toBe('78701');
    expect(postcodeFromAddress('900 Cedar Ave, Austin, TX 78701-1234')).toBe('78701');
    expect(postcodeFromAddress('900 Cedar Ave, Austin, TX 78701, USA')).toBe('78701');
    expect(postcodeFromAddress('  900 Cedar Ave, Austin, TX 78701  ')).toBe('78701');
  });

  it('does not mistake a house number for a zipcode', () => {
    expect(postcodeFromAddress('78701 Cedar Ave, Austin, TX')).toBeNull();
  });

  it('returns null when there is nothing to look up', () => {
    expect(postcodeFromAddress('12 Rue de la Paix, Paris, France')).toBeNull();
    expect(postcodeFromAddress('Flat 2, 14 Mill Lane, Cambridge CB2 1RX')).toBeNull();
    expect(postcodeFromAddress('')).toBeNull();
    expect(postcodeFromAddress('   ')).toBeNull();
  });
});
