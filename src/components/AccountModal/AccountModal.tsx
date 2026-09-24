/**
 * Account sign-in: not part of the web demo.
 *
 * The account button only appears when an auth endpoint is configured (`authAvailable()` in
 * src/config/auth.ts), and the demo build has none. The production sign-in flow lives in the
 * private repository; this stub keeps the export so the shared code compiles unchanged.
 */
export function AccountModal(_props: { onClose: () => void }): null {
  return null
}
