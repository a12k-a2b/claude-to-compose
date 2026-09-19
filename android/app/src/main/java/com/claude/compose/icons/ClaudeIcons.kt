package com.claude.compose.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

public object ClaudeIcons

public val ClaudeIcons.Icon1Icon: ImageVector
    get() {
        if (_icon1Icon != null) return _icon1Icon!!
        _icon1Icon = ImageVector.Builder(
            name = "Icon1Icon",
            defaultWidth = 22.dp,
            defaultHeight = 22.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFF8FAFC)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(15f, 5f)
                arcToRelative(3f, 3f, 0f, true, false, 6f, 0f)
                arcToRelative(3f, 3f, 0f, true, false, -6f, 0f)
                close()
            }
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFF8FAFC)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(3f, 12f)
                arcToRelative(3f, 3f, 0f, true, false, 6f, 0f)
                arcToRelative(3f, 3f, 0f, true, false, -6f, 0f)
                close()
            }
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFF8FAFC)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(15f, 19f)
                arcToRelative(3f, 3f, 0f, true, false, 6f, 0f)
                arcToRelative(3f, 3f, 0f, true, false, -6f, 0f)
                close()
            }
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFF8FAFC)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(8.59f, 13.51f)
                lineTo(15.42f, 17.49f)
            }
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFF8FAFC)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(15.41f, 6.51f)
                lineTo(8.59f, 10.49f)
            }
        }.build()
        return _icon1Icon!!
    }

private var _icon1Icon: ImageVector? = null

public val ClaudeIcons.Icon2Icon: ImageVector
    get() {
        if (_icon2Icon != null) return _icon2Icon!!
        _icon2Icon = ImageVector.Builder(
            name = "Icon2Icon",
            defaultWidth = 40.dp,
            defaultHeight = 40.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = SolidColor(Color(0xFF6366F1)),
                stroke = null,
                strokeLineWidth = 1f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(12f, 2f)
                curveTo(6.48f, 2f, 2f, 6.48f, 2f, 12f)
                reflectiveCurveToRelative(4.48f, 10f, 10f, 10f)
                reflectiveCurveToRelative(10f, -4.48f, 10f, -10f)
                reflectiveCurveTo(17.52f, 2f, 12f, 2f)
                close()
                moveToRelative(0f, 3f)
                curveToRelative(1.66f, 0f, 3f, 1.34f, 3f, 3f)
                reflectiveCurveToRelative(-1.34f, 3f, -3f, 3f)
                reflectiveCurveToRelative(-3f, -1.34f, -3f, -3f)
                reflectiveCurveToRelative(1.34f, -3f, 3f, -3f)
                close()
                moveToRelative(0f, 14.2f)
                curveToRelative(-2.5f, 0f, -4.71f, -1.28f, -6f, -3.22f)
                curveToRelative(0.03f, -1.99f, 4f, -3.08f, 6f, -3.08f)
                curveToRelative(1.99f, 0f, 5.97f, 1.09f, 6f, 3.08f)
                curveToRelative(-1.29f, 1.94f, -3.5f, 3.22f, -6f, 3.22f)
                close()
            }
        }.build()
        return _icon2Icon!!
    }

private var _icon2Icon: ImageVector? = null

public val ClaudeIcons.Icon3Icon: ImageVector
    get() {
        if (_icon3Icon != null) return _icon3Icon!!
        _icon3Icon = ImageVector.Builder(
            name = "Icon3Icon",
            defaultWidth = 20.dp,
            defaultHeight = 20.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFF8FAFC)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(3f, 3f)
                horizontalLineToRelative(7f)
                verticalLineToRelative(7f)
                horizontalLineToRelative(-7f)
                close()
            }
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFF8FAFC)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(14f, 3f)
                horizontalLineToRelative(7f)
                verticalLineToRelative(7f)
                horizontalLineToRelative(-7f)
                close()
            }
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFF8FAFC)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(14f, 14f)
                horizontalLineToRelative(7f)
                verticalLineToRelative(7f)
                horizontalLineToRelative(-7f)
                close()
            }
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFF8FAFC)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(3f, 14f)
                horizontalLineToRelative(7f)
                verticalLineToRelative(7f)
                horizontalLineToRelative(-7f)
                close()
            }
        }.build()
        return _icon3Icon!!
    }

private var _icon3Icon: ImageVector? = null

public val ClaudeIcons.Icon4Icon: ImageVector
    get() {
        if (_icon4Icon != null) return _icon4Icon!!
        _icon4Icon = ImageVector.Builder(
            name = "Icon4Icon",
            defaultWidth = 20.dp,
            defaultHeight = 20.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color(0xFF94A3B8)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(19f, 21f)
                lineToRelative(-7f, -5f)
                lineToRelative(-7f, 5f)
                verticalLineTo(5f)
                arcToRelative(2f, 2f, 0f, false, true, 2f, -2f)
                horizontalLineToRelative(10f)
                arcToRelative(2f, 2f, 0f, false, true, 2f, 2f)
                close()
            }
        }.build()
        return _icon4Icon!!
    }

private var _icon4Icon: ImageVector? = null

public val ClaudeIcons.Icon5Icon: ImageVector
    get() {
        if (_icon5Icon != null) return _icon5Icon!!
        _icon5Icon = ImageVector.Builder(
            name = "Icon5Icon",
            defaultWidth = 20.dp,
            defaultHeight = 20.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color(0xFF94A3B8)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(20.84f, 4.61f)
                lineTo(12f, 5.67f)
                lineToRelative(-1.06f, -1.06f)
                lineToRelative(1.06f, 1.06f)
                lineTo(12f, 21.23f)
                lineToRelative(7.78f, -7.78f)
                lineToRelative(1.06f, -1.06f)
                close()
            }
        }.build()
        return _icon5Icon!!
    }

private var _icon5Icon: ImageVector? = null

public val ClaudeIcons.Icon6Icon: ImageVector
    get() {
        if (_icon6Icon != null) return _icon6Icon!!
        _icon6Icon = ImageVector.Builder(
            name = "Icon6Icon",
            defaultWidth = 20.dp,
            defaultHeight = 20.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color(0xFF94A3B8)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(21f, 11.5f)
                arcToRelative(8.38f, 8.38f, 0f, false, true, -0.9f, 3.8f)
                arcToRelative(8.5f, 8.5f, 0f, false, true, -7.6f, 4.7f)
                arcToRelative(8.38f, 8.38f, 0f, false, true, -3.8f, -0.9f)
                lineTo(3f, 21f)
                lineToRelative(1.9f, -5.7f)
                arcToRelative(8.38f, 8.38f, 0f, false, true, -0.9f, -3.8f)
                arcToRelative(8.5f, 8.5f, 0f, false, true, 4.7f, -7.6f)
                arcToRelative(8.38f, 8.38f, 0f, false, true, 3.8f, -0.9f)
                horizontalLineToRelative(0.5f)
                arcToRelative(8.48f, 8.48f, 0f, false, true, 8f, 8f)
                verticalLineToRelative(0.5f)
                close()
            }
        }.build()
        return _icon6Icon!!
    }

private var _icon6Icon: ImageVector? = null

