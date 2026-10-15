"use client";

/**
 * The Appearance choice on Profile → Preferences.
 *
 * Saving is the form's job; this only applies the choice to the page as soon as
 * it's picked, so you can see it straight away instead of after a reload. The
 * attribute it sets is the same one the root layout renders, and globals.css
 * resolves it, so a preview and a saved value look identical.
 */
export function AppearanceSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select
      id="theme"
      name="theme"
      defaultValue={defaultValue}
      onChange={(e) => {
        document.documentElement.dataset.theme = e.target.value.toLowerCase();
      }}
    >
      <option value="SYSTEM">Match my device</option>
      <option value="LIGHT">Light</option>
      <option value="DARK">Dark</option>
    </select>
  );
}
