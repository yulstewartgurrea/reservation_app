"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { FormField as Field } from "@/components/FormSection";

const PHILIPPINES = "Philippines";

type Province = {
  code: string;
  name: string;
  type: string;
  region_code: string;
  region_name: string;
  island_group: string;
};
type City = {
  code: string;
  name: string;
  type: string;
  is_capital: boolean;
  province_code: string;
};
type Barangay = { code: string; name: string; city_code: string };

/** The slice of shop-form state this component owns. */
export type LocationFieldValues = {
  country: string;
  state_province: string;
  city: string;
  barangay: string;
  province_code: string;
  city_code: string;
  barangay_code: string;
};

const selectClasses =
  "w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const inputClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function Chevron() {
  return (
    <ChevronDown
      size={16}
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
    />
  );
}

/**
 * Country + (Province → City → Barangay) for the shop location form.
 *
 * When the country is the Philippines the three PSGC fields become cascading
 * dropdowns backed by /api/locations/* and persist both the PSGC `code` and the
 * display `name`. For any other country they fall back to plain text inputs
 * (PSGC only covers the Philippines).
 */
export function LocationFields({
  values,
  countries,
  onPatch,
}: {
  values: LocationFieldValues;
  countries: string[];
  onPatch: (patch: Partial<LocationFieldValues>) => void;
}) {
  const isPH = values.country === PHILIPPINES;

  const provincesQ = useQuery({
    queryKey: ["psgc", "provinces"],
    enabled: isPH,
    staleTime: Infinity,
    queryFn: async () =>
      (await api.get<Province[]>("/locations/provinces/")).data ?? [],
  });
  const citiesQ = useQuery({
    queryKey: ["psgc", "cities", values.province_code],
    enabled: isPH && Boolean(values.province_code),
    staleTime: Infinity,
    queryFn: async () =>
      (
        await api.get<City[]>("/locations/cities/", {
          params: { province: values.province_code },
        })
      ).data ?? [],
  });
  const barangaysQ = useQuery({
    queryKey: ["psgc", "barangays", values.city_code],
    enabled: isPH && Boolean(values.city_code),
    staleTime: Infinity,
    queryFn: async () =>
      (
        await api.get<Barangay[]>("/locations/barangays/", {
          params: { city: values.city_code },
        })
      ).data ?? [],
  });

  function onCountryChange(country: string) {
    // Switching country invalidates any previously-picked location.
    onPatch({
      country,
      state_province: "",
      city: "",
      barangay: "",
      province_code: "",
      city_code: "",
      barangay_code: "",
    });
  }

  function onProvinceChange(code: string) {
    const p = provincesQ.data?.find((x) => x.code === code);
    onPatch({
      province_code: code,
      state_province: p?.name ?? "",
      // Reset the dependent levels.
      city_code: "",
      city: "",
      barangay_code: "",
      barangay: "",
    });
  }

  function onCityChange(code: string) {
    const c = citiesQ.data?.find((x) => x.code === code);
    onPatch({
      city_code: code,
      city: c?.name ?? "",
      barangay_code: "",
      barangay: "",
    });
  }

  function onBarangayChange(code: string) {
    const b = barangaysQ.data?.find((x) => x.code === code);
    onPatch({ barangay_code: code, barangay: b?.name ?? "" });
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country" required>
          <div className="relative">
            <select
              value={values.country}
              onChange={(e) => onCountryChange(e.target.value)}
              required
              className={selectClasses}
            >
              <option value="" disabled>
                Select country
              </option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Chevron />
          </div>
        </Field>

        <Field label="State / Province" required>
          {isPH ? (
            <div className="relative">
              <select
                value={values.province_code}
                onChange={(e) => onProvinceChange(e.target.value)}
                required
                disabled={provincesQ.isLoading}
                className={selectClasses}
              >
                <option value="" disabled>
                  {provincesQ.isLoading
                    ? "Loading provinces…"
                    : "Select province"}
                </option>
                {provincesQ.data?.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
          ) : (
            <input
              type="text"
              value={values.state_province}
              onChange={(e) => onPatch({ state_province: e.target.value })}
              placeholder="e.g. Metro Manila"
              required
              className={inputClasses}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City / Municipality" required>
          {isPH ? (
            <div className="relative">
              <select
                value={values.city_code}
                onChange={(e) => onCityChange(e.target.value)}
                required
                disabled={!values.province_code || citiesQ.isLoading}
                className={selectClasses}
              >
                <option value="" disabled>
                  {!values.province_code
                    ? "Select province first"
                    : citiesQ.isLoading
                      ? "Loading cities…"
                      : "Select city / municipality"}
                </option>
                {citiesQ.data?.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
          ) : (
            <input
              type="text"
              value={values.city}
              onChange={(e) => onPatch({ city: e.target.value })}
              placeholder="e.g. Iligan"
              required
              className={inputClasses}
            />
          )}
        </Field>

        <Field label="Barangay / District">
          {isPH ? (
            <div className="relative">
              <select
                value={values.barangay_code}
                onChange={(e) => onBarangayChange(e.target.value)}
                disabled={!values.city_code || barangaysQ.isLoading}
                className={selectClasses}
              >
                <option value="" disabled>
                  {!values.city_code
                    ? "Select city first"
                    : barangaysQ.isLoading
                      ? "Loading barangays…"
                      : "Select barangay"}
                </option>
                {barangaysQ.data?.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
              <Chevron />
            </div>
          ) : (
            <input
              type="text"
              value={values.barangay}
              onChange={(e) => onPatch({ barangay: e.target.value })}
              placeholder="e.g. Pala-o"
              className={inputClasses}
            />
          )}
        </Field>
      </div>
    </>
  );
}
