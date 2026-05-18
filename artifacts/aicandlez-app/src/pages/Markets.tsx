import { Redirect } from "wouter";

// The legacy Markets page has been replaced by the unified AISignals feed.
// The bottom-nav "Crypto" tab now routes to /crypto which deep-links into
// the Crypto tab of AISignals. This file is kept as a redirect for any
// remaining /markets links in the wild.
export default function Markets() {
  return <Redirect to="/crypto" />;
}
