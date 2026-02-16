"use client";

interface ContentDisclosureSectionProps {
  disclosureEnabled: boolean;
  onToggleDisclosure: () => void;
  yourBrand: boolean;
  onYourBrandChange: (checked: boolean) => void;
  brandedContent: boolean;
  onBrandedContentChange: (checked: boolean) => void;
  privacyLevel: string;
}

export default function ContentDisclosureSection({
  disclosureEnabled,
  onToggleDisclosure,
  yourBrand,
  onYourBrandChange,
  brandedContent,
  onBrandedContentChange,
  privacyLevel,
}: ContentDisclosureSectionProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <h3 className="text-lg font-semibold text-slate-800">
        Content Disclosure
      </h3>

      {/* Toggle */}
      <label className="flex items-center justify-between">
        <span className="text-sm text-slate-700">Disclose video content</span>
        <button
          type="button"
          role="switch"
          aria-checked={disclosureEnabled}
          onClick={onToggleDisclosure}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            disclosureEnabled ? "bg-blue-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              disclosureEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </label>

      {disclosureEnabled && (
        <div className="space-y-3 pt-2 border-t border-slate-200">
          {/* Your Brand */}
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={yourBrand}
              onChange={(e) => onYourBrandChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm text-slate-700">Your Brand</span>
              <p className="text-xs text-slate-500">
                You are promoting yourself or your own business
              </p>
            </div>
          </label>

          {/* Branded Content */}
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={brandedContent}
              onChange={(e) => onBrandedContentChange(e.target.checked)}
              disabled={privacyLevel === "SELF_ONLY"}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <div>
              <span
                className={`text-sm ${privacyLevel === "SELF_ONLY" ? "text-slate-400" : "text-slate-700"}`}
              >
                Branded Content
              </span>
              <p className="text-xs text-slate-500">
                You are promoting another brand or a third party
              </p>
              {privacyLevel === "SELF_ONLY" && (
                <p className="text-xs text-amber-600">
                  Change privacy level first. Branded content cannot be private.
                </p>
              )}
            </div>
          </label>

          {/* Label preview */}
          {(yourBrand || brandedContent) && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              {brandedContent
                ? 'Your video will be labeled as "Paid partnership"'
                : 'Your video will be labeled as "Promotional content"'}
            </p>
          )}

          {/* Warning when disclosure ON but nothing selected */}
          {!yourBrand && !brandedContent && (
            <p className="text-xs text-amber-600">
              You need to indicate if your content promotes yourself, a third
              party, or both.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
