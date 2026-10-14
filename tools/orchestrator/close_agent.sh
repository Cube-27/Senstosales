#!/bin/bash
# close_agent.sh NAME — closes the herdr pane of agent NAME, so an idle agent stops holding memory. An agent that is
# already gone, or that belongs to another herdr workspace (another project), is not an error and is left alone:
# prints "gone NAME" and exits 0. Prints "closed NAME PANE", or "ERROR ..." on stderr and exits 1.
set -u
source "$(dirname "$0")/config.sh"
name=${1:-}
[[ -n $name ]] || err "usage: close_agent.sh NAME"
[[ -n ${HERDR_WORKSPACE_ID:-} ]] || err "HERDR_WORKSPACE_ID is unset: run this from a herdr pane"
if ! info=$(herdr agent get "$name" 2>/dev/null); then
  echo "gone $name"
  exit 0
fi
{ read -r pane; read -r workspace; } < <(json_field result.agent.pane_id result.agent.workspace_id <<< "$info")
[[ -n ${pane:-} ]] || err "no pane for agent $name"
if [[ ${workspace:-} != "$HERDR_WORKSPACE_ID" ]]; then
  echo "gone $name"
  exit 0
fi
herdr pane close "$pane" >/dev/null 2>&1 || err "could not close pane $pane of $name"
echo "closed $name $pane"
exit 0
