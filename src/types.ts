
export interface Env {
  ASSETS: Fetcher;
  FIXLINE_LOCATION_ID: string;
  FIXLINE_MODE: string;
  HYPERDRIVE?: { connectionString: string };
}

export type Organization = {
  id: string;
  display_name: string;
  organization_type: string;
  service_area_json?: { text?: string };
  verification_status: string;
  last_verified_at?: string;
};

export type Capability = { id: string; name: string };

export type OrgCapability = {
  organization_id: string;
  capability_id: string;
  availability_status: string;
};
