// Shared PostNord helpers — types and EDI builder for /rest/shipment/v3/edi
// Spec reference: PostNord General Description v22.7

export type IssuerCode = "Z11" | "Z12" | "Z13" | "Z14";

const COUNTRY_TO_ISSUER: Record<string, IssuerCode> = {
  DK: "Z11",
  SE: "Z12",
  NO: "Z13",
  FI: "Z14",
};

export function issuerFromCountry(country: string | null | undefined): IssuerCode {
  const c = (country ?? "SE").toUpperCase();
  return COUNTRY_TO_ISSUER[c] ?? "Z12";
}

export function isValidCustomerNumber(customerNumber: string, issuer: IssuerCode): boolean {
  const digits = customerNumber.replace(/\s+/g, "");
  if (!/^\d+$/.test(digits)) return false;
  switch (issuer) {
    case "Z11": return digits.length === 9;
    case "Z12":
    case "Z14": return digits.length === 8 || digits.length === 10;
    case "Z13": return digits.length === 7;
  }
}

export const POSTNORD_BASE_LIVE = "https://api2.postnord.com";
export const POSTNORD_BASE_SANDBOX = "https://atapi2.postnord.com";

export function postnordBase(env: "live" | "sandbox"): string {
  return env === "live" ? POSTNORD_BASE_LIVE : POSTNORD_BASE_SANDBOX;
}

export function clean<T>(v: T | "" | null | undefined): T | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v as T;
}

export function firstNonEmpty(...vals: Array<string | null | undefined>): string | undefined {
  for (const v of vals) {
    const c = clean(v);
    if (c) return c as string;
  }
  return undefined;
}

export interface PostNordAddress {
  streets: string[];
  postalCode: string;
  city: string;
  countryCode: string;
}

export interface PostNordContact {
  contactName?: string;
  emailAddress?: string;
  smsNo?: string;
  phoneNo?: string;
}

export interface PostNordParty {
  issuerCode?: IssuerCode;
  partyIdentification?: { partyId: string; partyIdType: "160" };
  party: {
    nameIdentification: { name: string };
    address: PostNordAddress;
    contact?: PostNordContact;
  };
}

export interface PostNordGoodsItem {
  packageTypeCode: "PC" | "PE" | "OA" | "AF" | "OF" | "EN" | "BX" | "PO" | "CW";
  items: Array<{
    itemIdentification: { itemId: string; itemIdType: "SSCC" | "S10" | "DPD" | "ZZZ" };
    grossWeight: { value: number; unit: "KGM" };
    measurements?: {
      length?: { value: number; unit: "CMT" };
      width?: { value: number; unit: "CMT" };
      height?: { value: number; unit: "CMT" };
    };
  }>;
}

export interface PostNordShipment {
  shipmentIdentification: { shipmentId: string };
  dateAndTimes: { loadingDate: string };
  service: { basicServiceCode: string };
  additionalServices?: Array<{ additionalServiceCode: string }>;
  freeText?: Array<{ textSubjectCode: string; freeText: string }>;
  numberOfPackages: { value: number };
  totalGrossWeight: { value: number; unit: "KGM" };
  parties: {
    consignor: PostNordParty;
    consignee: PostNordParty;
    freightPayer?: {
      issuerCode: IssuerCode;
      partyIdentification: { partyId: string; partyIdType: "160" };
    };
    originalShipper?: PostNordParty;
  };
  goodsItem: PostNordGoodsItem[];
  references?: Array<{ referenceCodeQualifier: string; reference: string }>;
}

export interface PostNordEdiBody {
  messageDate: string;
  messageFunction: "Instruction" | "BookingRequest";
  messageId: string;
  application: { applicationId: number; name: string; version: string };
  updateIndicator: "Original" | "Replace" | "Cancellation";
  shipment: PostNordShipment[];
}

export interface ConsigneeContactInfo {
  emailAddress?: string;
  smsNo?: string;
  phoneNo?: string;
}

export function validateServiceRules(
  serviceCode: string,
  additionalServiceCodes: string[],
  consigneeContact: ConsigneeContactInfo,
  consigneeCountry: string,
): string | null {
  const additional = new Set(additionalServiceCodes.map((s) => s.toUpperCase()));
  const country = consigneeCountry.toUpperCase();
  const hasSms = !!clean(consigneeContact.smsNo);
  const hasEmail = !!clean(consigneeContact.emailAddress);

  if (serviceCode === "17") {
    if (!additional.has("C7") && !additional.has("A6") && !additional.has("F1")) {
      return "Service 17 (MyPack Home) kräver tilläggstjänsten FlexChange (C7), Delivery without POD (A6) eller SameDay (F1).";
    }
    if (!hasSms && !hasEmail) {
      return "Service 17 (MyPack Home) kräver telefon (SMS) eller e-post på mottagaren.";
    }
    if (additional.has("A6") && country === "NO") {
      return "Tilläggstjänsten Delivery without POD (A6) är inte tillåten till Norge för MyPack Home.";
    }
  }

  if (serviceCode === "18") {
    if (!consigneeContact.phoneNo && !consigneeContact.smsNo) {
      return "Service 18 (Parcel) kräver telefonnummer på mottagaren.";
    }
  }

  if (serviceCode === "19") {
    const hasNotificationService = additional.has("A2") || additional.has("A3") || additional.has("A4");
    if (!hasNotificationService) {
      return "Service 19 (MyPack Collect) kräver en aviseringstjänst: A2 (brev), A3 (SMS) eller A4 (e-post).";
    }
    if (!["SE", "DK"].includes(country) && !additional.has("A7")) {
      return `Service 19 (MyPack Collect) till ${country} kräver tilläggstjänsten Optional Service Point (A7).`;
    }
  }

  return null;
}
