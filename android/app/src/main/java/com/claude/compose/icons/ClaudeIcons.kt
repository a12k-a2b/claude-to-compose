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
            defaultWidth = 14.dp,
            defaultHeight = 14.dp,
            viewportWidth = 20f,
            viewportHeight = 21f
        ).apply {
            path(
                fill = SolidColor(Color(0xFFD97757)),
                stroke = null,
                strokeLineWidth = 1f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(9.99902f, 0f)
                curveTo(15.5258f, 0.000170936f, 19.999f, 4.50643f, 19.999f, 10.0547f)
                curveTo(19.999f, 11.7656f, 19.5863f, 12.9976f, 18.7861f, 13.8203f)
                curveTo(17.9924f, 14.6362f, 16.9465f, 14.9138f, 15.9854f, 15.0078f)
                curveTo(15.05f, 15.0993f, 14.0097f, 15.0262f, 13.2549f, 15.0186f)
                curveTo(12.8524f, 15.0145f, 12.5177f, 15.0267f, 12.2441f, 15.0703f)
                curveTo(11.9682f, 15.1144f, 11.8143f, 15.1813f, 11.7305f, 15.2432f)
                curveTo(11.4745f, 15.4322f, 11.3353f, 15.7121f, 11.2656f, 16.1602f)
                curveTo(11.2303f, 16.3875f, 11.2168f, 16.6362f, 11.209f, 16.9131f)
                curveTo(11.2017f, 17.1715f, 11.1986f, 17.4893f, 11.1807f, 17.7705f)
                curveTo(11.1469f, 18.2975f, 11.0495f, 19.0865f, 10.4199f, 19.5908f)
                curveTo(9.7846f, 20.0996f, 8.88652f, 20.1057f, 7.85449f, 19.877f)
                curveTo(7.36399f, 19.7682f, 6.88652f, 19.6232f, 6.42578f, 19.4453f)
                curveTo(2.66989f, 17.9949f, 0.000187748f, 14.3414f, 0f, 10.0547f)
                curveTo(0f, 4.50643f, 4.47223f, 0.000171048f, 9.99902f, 0f)
                close()
                moveTo(9.99902f, 1.60547f)
                curveTo(5.36781f, 1.60564f, 1.60547f, 5.38391f, 1.60547f, 10.0547f)
                curveTo(1.60566f, 13.6582f, 3.84823f, 16.7296f, 7.00391f, 17.9482f)
                curveTo(7.39027f, 18.0974f, 7.79085f, 18.2184f, 8.20215f, 18.3096f)
                curveTo(9.1375f, 18.5169f, 9.384f, 18.3633f, 9.41602f, 18.3379f)
                curveTo(9.4524f, 18.3087f, 9.54558f, 18.1915f, 9.5791f, 17.668f)
                curveTo(9.5947f, 17.4239f, 9.59473f, 17.1786f, 9.60352f, 16.8672f)
                curveTo(9.61179f, 16.5742f, 9.62831f, 16.2435f, 9.67969f, 15.9131f)
                curveTo(9.78359f, 15.2455f, 10.0474f, 14.4906f, 10.7764f, 13.9521f)
                curveTo(11.1479f, 13.6778f, 11.5842f, 13.5493f, 11.9912f, 13.4844f)
                curveTo(12.4007f, 13.4191f, 12.8434f, 13.4088f, 13.2705f, 13.4131f)
                curveTo(14.1753f, 13.4222f, 15.0071f, 13.4905f, 15.8291f, 13.4102f)
                curveTo(16.6257f, 13.3322f, 17.2249f, 13.1235f, 17.6357f, 12.7012f)
                curveTo(18.0401f, 12.2855f, 18.3935f, 11.5261f, 18.3936f, 10.0547f)
                curveTo(18.3936f, 5.38391f, 14.6302f, 1.60564f, 9.99902f, 1.60547f)
                close()
                moveTo(5.11621f, 9.86719f)
                curveTo(5.86386f, 9.91468f, 6.45486f, 10.5348f, 6.45508f, 11.2939f)
                curveTo(6.45506f, 12.0838f, 5.81519f, 12.7245f, 5.02539f, 12.7246f)
                curveTo(4.28481f, 12.7246f, 3.67573f, 12.1617f, 3.60254f, 11.4404f)
                lineTo(3.59473f, 11.2939f)
                lineTo(3.60156f, 11.1533f)
                curveTo(3.66942f, 10.4596f, 4.23282f, 9.91186f, 4.93359f, 9.86719f)
                horizontalLineTo(5.11621f)
                close()
                moveTo(14.9814f, 7.19141f)
                curveTo(15.729f, 7.23889f, 16.3199f, 7.85919f, 16.3203f, 8.61816f)
                curveTo(16.3203f, 9.40801f, 15.6804f, 10.0487f, 14.8906f, 10.0488f)
                curveTo(14.1501f, 10.0487f, 13.5409f, 9.48586f, 13.4678f, 8.76465f)
                lineTo(13.46f, 8.61816f)
                lineTo(13.4668f, 8.47754f)
                curveTo(13.5348f, 7.78403f, 14.0983f, 7.23618f, 14.7988f, 7.19141f)
                horizontalLineTo(14.9814f)
                close()
                moveTo(6.4541f, 4.93457f)
                curveTo(7.20161f, 4.9822f, 7.79275f, 5.60231f, 7.79297f, 6.36133f)
                curveTo(7.79288f, 7.151f, 7.15291f, 7.7917f, 6.36328f, 7.79199f)
                curveTo(5.62274f, 7.79199f, 5.01369f, 7.22903f, 4.94043f, 6.50781f)
                lineTo(4.93262f, 6.36133f)
                lineTo(4.93945f, 6.2207f)
                curveTo(5.00731f, 5.52698f, 5.5707f, 4.97922f, 6.27148f, 4.93457f)
                horizontalLineTo(6.4541f)
                close()
                moveTo(11.3867f, 3.59668f)
                curveTo(12.1343f, 3.64419f, 12.7253f, 4.26436f, 12.7256f, 5.02344f)
                curveTo(12.7256f, 5.81326f, 12.0857f, 6.45393f, 11.2959f, 6.4541f)
                curveTo(10.5553f, 6.4541f, 9.94622f, 5.89123f, 9.87305f, 5.16992f)
                lineTo(9.86523f, 5.02344f)
                lineTo(9.87207f, 4.88281f)
                curveTo(9.93996f, 4.18912f, 10.5033f, 3.64133f, 11.2041f, 3.59668f)
                horizontalLineTo(11.3867f)
                close()
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
            defaultWidth = 12.dp,
            defaultHeight = 12.dp,
            viewportWidth = 12f,
            viewportHeight = 12f
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color(0xFF141413)),
                strokeLineWidth = 1.5f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(2f, 2f)
                lineToRelative(8f, 8f)
                moveTo(10f, 2f)
                lineToRelative(-8f, 8f)
            }
        }.build()
        return _icon2Icon!!
    }

private var _icon2Icon: ImageVector? = null

