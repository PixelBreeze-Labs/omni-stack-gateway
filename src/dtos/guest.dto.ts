export class GetOrCreateGuestDto {
  name: string;
  surname?: string;
  email: string;
  phone?: string;
  password: string;
  registrationSource?: string;
  external_ids?: {
    venueBoostUserId?: string;
    venueBoostGuestId?: string;
  };
  address?: {
    addressLine1?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}
