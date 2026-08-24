package ai.deepseek.harness.mobile.git

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

fun parseVcsStatus(obj: JsonObject?): VcsStatus {
    if (obj == null) return VcsStatus()
    val prObj = obj["pr"] as? JsonObject
    return VcsStatus(
        isRepo = obj["isRepo"]?.jsonPrimitive?.booleanOrNull != false,
        refName = obj["refName"]?.jsonPrimitive?.contentOrNull,
        hasWorkingTreeChanges = obj["hasWorkingTreeChanges"]?.jsonPrimitive?.booleanOrNull == true,
        hasUpstream = obj["hasUpstream"]?.jsonPrimitive?.booleanOrNull == true,
        aheadCount = obj["aheadCount"]?.jsonPrimitive?.intOrNull ?: 0,
        behindCount = obj["behindCount"]?.jsonPrimitive?.intOrNull ?: 0,
        isDefaultRef = obj["isDefaultRef"]?.jsonPrimitive?.booleanOrNull == true,
        hasPrimaryRemote = obj["hasPrimaryRemote"]?.jsonPrimitive?.booleanOrNull == true,
        pr = prObj?.let {
            PrInfo(
                state = it["state"]?.jsonPrimitive?.contentOrNull,
                number = it["number"]?.jsonPrimitive?.intOrNull,
                url = it["url"]?.jsonPrimitive?.contentOrNull,
            )
        },
    )
}

data class BranchRef(
    val name: String,
    val isRemote: Boolean = false,
    val isCurrent: Boolean = false,
)

fun parseBranchList(obj: JsonObject?): List<BranchRef> {
    val items = obj?.get("branches")?.jsonArray ?: return emptyList()
    return items.mapNotNull { item ->
        val row = item as? JsonObject ?: return@mapNotNull null
        val name = row["name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        BranchRef(
            name = name,
            isRemote = row["isRemote"]?.jsonPrimitive?.booleanOrNull == true,
            isCurrent = row["isCurrent"]?.jsonPrimitive?.booleanOrNull == true,
        )
    }
}
