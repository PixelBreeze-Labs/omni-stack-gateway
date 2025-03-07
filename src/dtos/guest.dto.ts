export class GetOrCreateGuestDto {
  external_id?: string;
  name: string;
  surname?: string;
  email: string;
  phone?: string;
  password: string;
  registrationSource?: string;
  address?: {
    addressLine1?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}
