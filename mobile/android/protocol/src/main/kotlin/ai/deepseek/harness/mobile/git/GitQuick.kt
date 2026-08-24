package ai.deepseek.harness.mobile.git

data class PrInfo(val state: String? = null, val number: Int? = null, val url: String? = null)

data class VcsStatus(
    val isRepo: Boolean = false,
    val refName: String? = null,
    val hasWorkingTreeChanges: Boolean = false,
    val hasUpstream: Boolean = false,
    val aheadCount: Int = 0,
    val behindCount: Int = 0,
    val isDefaultRef: Boolean = false,
    val hasPrimaryRemote: Boolean = false,
    val pr: PrInfo? = null,
)

data class GitQuick(
    val label: String,
    val disabled: Boolean,
    val kind: String,
    val action: String? = null,
    val hint: String = "",
)

object GitQuickResolver {
    fun resolve(status: VcsStatus, busy: Boolean): GitQuick {
        if (busy) return GitQuick("Commit", true, "show_hint", hint = "Git 操作进行中。")
        val hasBranch = status.refName != null
        val hasChanges = status.hasWorkingTreeChanges
        val hasOpenPr = status.pr?.state == "open"
        val isAhead = status.aheadCount > 0
        val isBehind = status.behindCount > 0
        val isDiverged = isAhead && isBehind
        if (!hasBranch) return GitQuick("Commit", true, "show_hint", hint = "请先创建并检出分支。")
        if (hasChanges) {
            if (!status.hasUpstream && !status.hasPrimaryRemote) {
                return GitQuick("Commit", false, "run_action", "commit")
            }
            if (hasOpenPr || status.isDefaultRef) {
                return GitQuick("Commit & push", false, "run_action", "commit_push")
            }
            return GitQuick("Commit, push & PR", false, "run_action", "commit_push_pr")
        }
        if (!status.hasUpstream) {
            if (!status.hasPrimaryRemote) return GitQuick("Publish repository", false, "open_publish")
            return GitQuick("Push", false, "run_action", "push")
        }
        if (isDiverged) return GitQuick("Sync branch", true, "show_hint", hint = "分支已分叉，请先变基或合并。")
        if (isBehind) return GitQuick("Pull", false, "run_pull")
        if (isAhead) {
            if (hasOpenPr || status.isDefaultRef) return GitQuick("Push", false, "run_action", "push")
            return GitQuick("Push & create PR", false, "run_action", "create_pr")
        }
        if (hasOpenPr && status.hasUpstream) return GitQuick("View PR", false, "open_pr")
        return GitQuick("Commit", true, "show_hint", hint = "分支已是最新，无需操作。")
    }
}
