export const foundationOrganization = {
  name: "Olivia's Garden Foundation",
  legalName: "Olivia's Garden Foundation",
  ein: '33-3101032',
  contactEmail: 'allen@oliviasgarden.org',
  logoImage: '/images/icons/logo.svg',
  mailingAddress: {
    line1: '1820 Meadow Ranch Rd',
    city: 'McKinney',
    region: 'TX',
    postalCode: '75071',
    country: 'USA',
  },
  foundedYear: 2025,
  irsDeterminationDate: 'March 5, 2025',
} as const;

export type BoardMember = {
  name: string;
  role: string;
  bio?: string;
};

// Board / governance disclosure for the About page. Standard donor-trust
// practice for a 501(c)(3). Fill this in with the real board roster — name,
// role, and a one-line bio each. The Governance section renders the member
// list automatically once at least one member is listed.
export const boardMembers: BoardMember[] = [];
