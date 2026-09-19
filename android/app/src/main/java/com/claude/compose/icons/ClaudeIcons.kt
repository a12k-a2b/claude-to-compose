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
            defaultWidth = 28.dp,
            defaultHeight = 28.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color(0xFF4F46E5)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(12f, 2f)
                lineTo(2f, 7f)
                lineToRelative(10f, 5f)
                lineToRelative(10f, -5f)
                lineToRelative(-10f, -5f)
                close()
                moveTo(2f, 17f)
                lineToRelative(10f, 5f)
                lineToRelative(10f, -5f)
                moveTo(2f, 12f)
                lineToRelative(10f, 5f)
                lineToRelative(10f, -5f)
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
            defaultWidth = 18.dp,
            defaultHeight = 18.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color(0xFFFFFFFF)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(21f, 15f)
                verticalLineToRelative(4f)
                horizontalLineTo(5f)
                verticalLineToRelative(-4f)
                moveTo(7f, 10f)
                lineToRelative(5f, 5f)
                lineToRelative(5f, -5f)
                moveTo(12f, 15f)
                verticalLineTo(3f)
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
                stroke = SolidColor(Color(0xFF10B981)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(12f, 1f)
                verticalLineToRelative(22f)
                moveTo(17f, 5f)
                horizontalLineTo(9.5f)
                horizontalLineToRelative(5f)
                horizontalLineTo(6f)
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
                stroke = SolidColor(Color(0xFF6B7280)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(17f, 21f)
                verticalLineToRelative(-2f)
                horizontalLineTo(5f)
                verticalLineToRelative(2f)
            }
            path(
                fill = null,
                stroke = SolidColor(Color(0xFF6B7280)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(5f, 7f)
                arcToRelative(4f, 4f, 0f, true, false, 8f, 0f)
                arcToRelative(4f, 4f, 0f, true, false, -8f, 0f)
                close()
            }
            path(
                fill = null,
                stroke = SolidColor(Color(0xFF6B7280)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(23f, 21f)
                verticalLineToRelative(-2f)
                moveTo(16f, 3.13f)
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
                stroke = SolidColor(Color(0xFFEF4444)),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(22f, 12f)
                horizontalLineToRelative(-4f)
                lineToRelative(-3f, 9f)
                lineTo(9f, 3f)
                lineToRelative(-3f, 9f)
                horizontalLineTo(2f)
            }
        }.build()
        return _icon5Icon!!
    }

private var _icon5Icon: ImageVector? = null

