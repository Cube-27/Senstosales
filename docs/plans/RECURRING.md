# Recurring findings

Mistakes that agents made more than once, and what now prevents each one. The orchestrator keeps this file current
(`/run-plan` §2a). A finding that recurs gets a **check** where one can catch it (type, lint rule, `tools/` scan, CI
step); a **skill rule** only where no check can. Workers read this list before opening a PR (`/implement-pr` §4);
reviewers check diffs against it (`/review-pr` §2).

| Finding                       | Seen in                   | Prevented by                                            |
| ----------------------------- | ------------------------- | ------------------------------------------------------- |
| <what went wrong, concretely> | <#PRs, or "orchestrator"> | Check: <tool/rule>, or Skill rule (`/skill` §n): <rule> |

Seed rows learned on earlier projects (keep them; their checks ship with the orchestrator scripts):

| Finding                                                                               | Seen in         | Prevented by                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An agent merged its own PR, skipping the tracker commit.                              | earlier project | Check: `merge_guard.py` PreToolUse hook; `merge_pr.sh` is the only merge path.                                                                                                                          |
| A merge or cleanup ran after a failed CI wait because commands were chained with `;`. | earlier project | Check: `merge_pr.sh` merges only on a passing wait pinned to the head SHA; `cleanup_worktree.sh` refuses while a PR is open or unmerged. Skill rule (`/run-plan` §1.3): `if merge_pr.sh …; then …; fi`. |
| A CI wait read the previous commit's results, or waited forever on a conflicting PR.  | earlier project | Check: `wait_ci.sh` waits on the head SHA and fails fast on conflicts or no workflow run.                                                                                                               |
| Agent panes opened in the wrong cwd or herdr workspace, or with an uppercase name.    | earlier project | Check: `start_agent.sh` builds the path, checks the cwd, passes `--workspace`, validates the name.                                                                                                      |
| An agent acted on a prompt suggestion nobody typed.                                   | earlier project | Check: `start_agent.sh` sets `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false`.                                                                                                                              |
| Idle reviewer panes held memory after their verdict.                                  | earlier project | Skill rule: reviewer closes its own pane; implementor runs `close_agent.sh`.                                                                                                                            |
| The watcher was started detached with `&` and could never notify.                     | earlier project | Check: `watch_agents.sh` is single-instance. Skill rule: start it only as a tracked background task.                                                                                                    |
