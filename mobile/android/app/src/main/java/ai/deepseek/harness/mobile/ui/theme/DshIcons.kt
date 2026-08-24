package ai.deepseek.harness.mobile.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

object DshIcons {
    val Menu = stroke("Menu") {
        moveTo(3f, 4.5f); horizontalLineTo(13f)
        moveTo(3f, 8f); horizontalLineTo(13f)
        moveTo(3f, 11.5f); horizontalLineTo(13f)
    }
    val Plus = stroke("Plus", 1.4f) {
        moveTo(8f, 3f); verticalLineTo(13f)
        moveTo(3f, 8f); horizontalLineTo(13f)
    }
    val Send = stroke("Send", 1.4f) {
        moveTo(3f, 8f); horizontalLineTo(13f)
        moveTo(9f, 4f); lineTo(13f, 8f); lineTo(9f, 12f)
    }
    val Close = stroke("Close", 1.4f, 14f) {
        moveTo(3f, 3f); lineTo(11f, 11f)
        moveTo(11f, 3f); lineTo(3f, 11f)
    }
    val Back = stroke("Back", 1.4f) {
        moveTo(10f, 3.5f); lineTo(5.5f, 8f); lineTo(10f, 12.5f)
    }
    val Chevron = stroke("Chevron", 1.4f) {
        moveTo(6f, 3.5f); lineTo(10.5f, 8f); lineTo(6f, 12.5f)
    }
    val ChevronDown = stroke("ChevronDown", 1.4f) {
        moveTo(3.5f, 6f); lineTo(8f, 10.5f); lineTo(12.5f, 6f)
    }
    val Branch = stroke("Branch", 1.2f) {
        moveTo(6.5f, 3.5f)
        arcTo(1.5f, 1.5f, 0f, false, true, 5f, 5f)
        arcTo(1.5f, 1.5f, 0f, false, true, 3.5f, 3.5f)
        arcTo(1.5f, 1.5f, 0f, false, true, 6.5f, 3.5f)
        moveTo(5f, 5f); verticalLineTo(11f)
        moveTo(6.5f, 12.5f)
        arcTo(1.5f, 1.5f, 0f, false, true, 5f, 14f)
        arcTo(1.5f, 1.5f, 0f, false, true, 3.5f, 12.5f)
        arcTo(1.5f, 1.5f, 0f, false, true, 6.5f, 12.5f)
        moveTo(12.5f, 3.5f)
        arcTo(1.5f, 1.5f, 0f, false, true, 11f, 5f)
        arcTo(1.5f, 1.5f, 0f, false, true, 9.5f, 3.5f)
        arcTo(1.5f, 1.5f, 0f, false, true, 12.5f, 3.5f)
        moveTo(11f, 5f)
        curveTo(11f, 8f, 8f, 9.5f, 5f, 9.5f)
    }
    val Gear = stroke("Gear", 1.2f) {
        moveTo(10.1f, 8f)
        arcTo(2.1f, 2.1f, 0f, false, true, 8f, 10.1f)
        arcTo(2.1f, 2.1f, 0f, false, true, 5.9f, 8f)
        arcTo(2.1f, 2.1f, 0f, false, true, 10.1f, 8f)
        moveTo(8f, 2.4f); lineTo(8f, 4.4f)
        moveTo(8f, 11.6f); lineTo(8f, 13.6f)
        moveTo(2.4f, 8f); lineTo(4.4f, 8f)
        moveTo(11.6f, 8f); lineTo(13.6f, 8f)
        moveTo(4.05f, 4.05f); lineTo(5.45f, 5.45f)
        moveTo(10.55f, 10.55f); lineTo(11.95f, 11.95f)
        moveTo(11.95f, 4.05f); lineTo(10.55f, 5.45f)
        moveTo(5.45f, 10.55f); lineTo(4.05f, 11.95f)
    }
    val Commit = stroke("Commit", 1.2f) {
        moveTo(8f, 2.5f); verticalLineTo(5.7f)
        moveTo(8f, 10.3f); verticalLineTo(13.5f)
        moveTo(10.2f, 8f)
        arcTo(2.2f, 2.2f, 0f, true, true, 5.8f, 8f)
        arcTo(2.2f, 2.2f, 0f, true, true, 10.2f, 8f)
    }
    val Push = stroke("Push", 1.2f) {
        moveTo(8f, 12.5f); verticalLineTo(4.5f)
        moveTo(5f, 7f); lineTo(8f, 4f); lineTo(11f, 7f)
        moveTo(3.5f, 13.5f); horizontalLineTo(12.5f)
    }
    val PullRequest = stroke("PullRequest", 1.2f) {
        moveTo(6.6f, 4f)
        arcTo(1.6f, 1.6f, 0f, true, true, 3.4f, 4f)
        arcTo(1.6f, 1.6f, 0f, true, true, 6.6f, 4f)
        moveTo(12.6f, 12f)
        arcTo(1.6f, 1.6f, 0f, true, true, 9.4f, 12f)
        arcTo(1.6f, 1.6f, 0f, true, true, 12.6f, 12f)
        moveTo(5f, 5.6f); verticalLineTo(12.4f)
        moveTo(11f, 10.4f); verticalLineTo(6.5f)
    }
    val Stop = ImageVector.Builder("Stop", 12.dp, 12.dp, 12f, 12f).apply {
        path(fill = SolidColor(Color.Black)) {
            moveTo(3.5f, 2f)
            horizontalLineTo(8.5f)
            arcTo(1.5f, 1.5f, 0f, false, true, 10f, 3.5f)
            verticalLineTo(8.5f)
            arcTo(1.5f, 1.5f, 0f, false, true, 8.5f, 10f)
            horizontalLineTo(3.5f)
            arcTo(1.5f, 1.5f, 0f, false, true, 2f, 8.5f)
            verticalLineTo(3.5f)
            arcTo(1.5f, 1.5f, 0f, false, true, 3.5f, 2f)
            close()
        }
    }.build()
}

private fun stroke(
    name: String,
    width: Float = 1.3f,
    size: Float = 16f,
    block: PathBuilder.() -> Unit,
): ImageVector {
    return ImageVector.Builder(name, size.dp, size.dp, size, size).apply {
        path(
            fill = SolidColor(Color.Transparent),
            stroke = SolidColor(Color.Black),
            strokeLineWidth = width,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
            pathBuilder = block,
        )
    }.build()
}
