import { AVAILABILITY_OVERRIDES, BUSINESS_TYPES, DELIVERY_MODES, registerSellerSchema, updateSellerSchema } from '../src/validators/seller.validator';

// What a kitchen may choose for its profile is what the sign-up form and the settings page offer, and nothing else:
// a value the screens do not know used to be stored (and a "cut-off" that is not a time was stored and never applied),
// and a null that no column can hold reached the database as a 500.

const update = (body: unknown) => updateSellerSchema.safeParse(body);
const register = (extra: Record<string, unknown> = {}) => registerSellerSchema.safeParse({ businessName: 'Aysha Kitchen', ...extra });

describe('business type', () => {
  it.each(BUSINESS_TYPES)('accepts %s when registering and when editing', (type) => {
    expect(register({ businessType: type }).success).toBe(true);
    expect(update({ businessType: type }).success).toBe(true);
  });

  it('refuses one the app does not offer, however it is written', () => {
    for (const bad of ['palace', 'Restaurant', 'home kitchen', '', 5]) {
      expect(register({ businessType: bad }).success).toBe(false);
      expect(update({ businessType: bad }).success).toBe(false);
    }
  });

  it('refuses null on an update (the column cannot hold it) and defaults a registration to a home kitchen', () => {
    expect(update({ businessType: null }).success).toBe(false);
    const registered = register();
    expect(registered.success && registered.data.businessType).toBe('home_kitchen');
  });
});

describe('delivery modes', () => {
  it('accepts any of the three offered, together or alone', () => {
    for (const modes of [['delivery'], ['pickup'], ['delivery', 'pickup'], ['delivery', 'pickup', 'dine_in'], []]) {
      expect(register({ deliveryModes: modes }).success).toBe(true);
      expect(update({ deliveryModes: modes }).success).toBe(true);
    }
    expect(DELIVERY_MODES).toEqual(['delivery', 'pickup', 'dine_in']);
  });

  it('refuses a mode the app does not offer, null, and a list longer than the choices', () => {
    for (const bad of [['teleport'], ['delivery', 'Delivery'], [1], ['delivery', 'pickup', 'dine_in', 'delivery']]) {
      expect(register({ deliveryModes: bad }).success).toBe(false);
      expect(update({ deliveryModes: bad }).success).toBe(false);
    }
    expect(update({ deliveryModes: null }).success).toBe(false);
  });
});

describe('availability override', () => {
  it.each(AVAILABILITY_OVERRIDES)('accepts %s', (override) => {
    expect(update({ availabilityOverride: override }).success).toBe(true);
  });

  it('accepts null (follow the schedule) and refuses what the app does not know', () => {
    expect(update({ availabilityOverride: null }).success).toBe(true);
    for (const bad of ['party', 'Closed', '', 'on_holiday']) expect(update({ availabilityOverride: bad }).success).toBe(false);
  });
});

describe('daily cut-off time', () => {
  it('accepts HH:MM and null (no cut-off)', () => {
    for (const ok of ['00:00', '09:05', '21:30', '23:59', null]) expect(update({ orderCutoffTime: ok }).success).toBe(true);
  });

  it('refuses anything that is not a time of day, which the availability code would read as NaN and never apply', () => {
    for (const bad of ['soon', '25:00', '24:00', '9:30', '21:30:00', '21.30', '', 2130]) expect(update({ orderCutoffTime: bad }).success).toBe(false);
  });
});

describe('meal categories', () => {
  // The sign-up form stores dish styles ("Biryani", "Burgers") and the settings page meal times ("lunch"), and the
  // product filter matches either: a list enforced here would break sign-up. Keep it free text until that is decided.
  it('stays free text', () => {
    expect(register({ mealCategories: ['Biryani', 'Karahi & Handi'] }).success).toBe(true);
    expect(update({ mealCategories: ['lunch', 'dinner'] }).success).toBe(true);
    expect(update({ mealCategories: ['Biryani', 'Kebabs & BBQ'] }).success).toBe(true);
  });
});
