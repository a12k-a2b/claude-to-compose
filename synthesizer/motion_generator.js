/**
 * synthesizer/motion_generator.js
 * Jetpack Compose Material 3 UX, Ripple, Elevation, Animations, and Touch Target compliance engine.
 * Covers: R2 / ORIGINAL_REQUEST §R2 / PROJECT.md §Feature 19, 20, 21.
 */

const standardEasings = {
  'linear': 'LinearEasing',
  'ease': 'FastOutSlowInEasing',
  'ease-in': 'FastOutLinearInEasing',
  'ease-out': 'LinearOutSlowInEasing',
  'ease-in-out': 'FastOutSlowInEasing'
};

class MotionGenerator {
  /**
   * Maps CSS easing functions to Jetpack Compose AnimationSpec easing curves.
   * Unknown easings fall back to FastOutSlowInEasing.
   * @param {string} cssEasing
   * @returns {string} Compose easing identifier
   */
  static mapCssEasing(cssEasing) {
    if (!cssEasing || typeof cssEasing !== 'string') return 'FastOutSlowInEasing';
    return standardEasings[cssEasing.trim().toLowerCase()] || 'FastOutSlowInEasing';
  }

  /**
   * Resolves an animation spec string based on transition duration.
   * Durations <= 0ms return 'snap()', while > 0ms return 'tween(durationMillis = ...)'.
   * @param {number} durationMs
   * @param {string} [easing='ease']
   * @param {number} [delayMs=0]
   * @returns {string}
   */
  static resolveAnimationSpec(durationMs, easing = 'ease', delayMs = 0) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return 'snap()';
    }
    const composeEasing = MotionGenerator.mapCssEasing(easing);
    const delayParam = Number.isFinite(delayMs) && delayMs > 0 ? `, delayMillis = ${delayMs}` : '';
    return `tween(durationMillis = ${Math.round(durationMs)}${delayParam}, easing = ${composeEasing})`;
  }

  /**
   * Validates spring physics parameters, ensuring strictly positive values.
   * Throws InvalidSpringParamsError if damping or stiffness is <= 0.
   * @param {number} damping
   * @param {number} stiffness
   * @returns {boolean}
   */
  static validateSpringParams(damping, stiffness) {
    if (!Number.isFinite(damping) || damping <= 0 || !Number.isFinite(stiffness) || stiffness <= 0) {
      throw new Error('InvalidSpringParamsError: Damping and stiffness must be positive');
    }
    return true;
  }

  /**
   * Validates interactive target dimensions, rejecting <= 0 values.
   * Throws ZeroDimensionTargetError if width or height is <= 0.
   * @param {number} w
   * @param {number} h
   * @returns {boolean}
   */
  static validateTargetDimensions(w, h) {
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      throw new Error('ZeroDimensionTargetError: Interactive component cannot have 0 size');
    }
    return true;
  }

  /**
   * Calculates effective bounding size factoring in padding.
   * @param {number} width
   * @param {number} height
   * @param {Object} [padding={}] - { top, right, bottom, left }
   * @returns {{ effectiveWidth: number, effectiveHeight: number }}
   */
  static calculateEffectiveTarget(width, height, padding = {}) {
    const padL = parseFloat(padding.left) || 0;
    const padR = parseFloat(padding.right) || 0;
    const padT = parseFloat(padding.top) || 0;
    const padB = parseFloat(padding.bottom) || 0;

    return {
      effectiveWidth: width + padL + padR,
      effectiveHeight: height + padT + padB
    };
  }

  /**
   * Audits a node and wraps sub-48dp interactive components with minimumInteractiveComponentSize.
   * @param {Object} node
   * @returns {Object} Node with appliedModifier attached if below 48dp
   */
  static ensureCompliantTouchTarget(node) {
    if (!node) return node;

    if (node.isInteractive) {
      MotionGenerator.validateTargetDimensions(node.width || 48, node.height || 48);

      const effective = MotionGenerator.calculateEffectiveTarget(
        node.width || 0,
        node.height || 0,
        node.padding || {}
      );

      if (effective.effectiveWidth < 48 || effective.effectiveHeight < 48) {
        return {
          ...node,
          appliedModifier: 'Modifier.minimumInteractiveComponentSize()'
        };
      }
    }
    return node;
  }

  /**
   * Generates a clickable Modifier expression with native touch ripple.
   * Returns 'Modifier' if disabled, suppressing false ripple triggers.
   * @param {Object} [options={}]
   * @returns {string}
   */
  static generateRippleModifier(options = {}) {
    const enabled = options.enabled !== false;
    const bounded = options.bounded !== false;
    const onClick = options.onClick || 'onClick';

    if (!enabled) {
      return 'Modifier';
    }

    return `Modifier.clickable(interactionSource = remember { MutableInteractionSource() }, indication = ripple(bounded = ${bounded})) { ${onClick}() }`;
  }

  /**
   * Generates dynamic elevation state logic based on interactionSource pressed state.
   * @param {Object} [options={}]
   * @returns {string} Kotlin snippet
   */
  static generatePressedElevation(options = {}) {
    const defaultElevation = options.defaultElevation !== undefined ? options.defaultElevation : 2;
    const pressedElevation = options.pressedElevation !== undefined ? options.pressedElevation : 6;
    const label = options.label || 'buttonElevation';

    return `val isPressed by interactionSource.collectIsPressedAsState()\n` +
           `val animatedElevation by animateDpAsState(\n` +
           `    targetValue = if (isPressed) ${pressedElevation}.dp else ${defaultElevation}.dp,\n` +
           `    animationSpec = spring(stiffness = Spring.StiffnessMediumLow),\n` +
           `    label = "${label}"\n` +
           `)`;
  }

  /**
   * Generates an AnimatedVisibility composable wrapper snippet.
   * @param {Object} [options={}]
   * @returns {string} Kotlin snippet
   */
  static generateAnimatedVisibility(options = {}) {
    const visibleCondition = options.visibleCondition || 'isVisible';
    const durationMs = options.durationMs || 300;
    const content = options.content || 'ContentComposable()';

    return `AnimatedVisibility(\n` +
           `    visible = ${visibleCondition},\n` +
           `    enter = fadeIn(animationSpec = tween(${durationMs})) + expandVertically(),\n` +
           `    exit = fadeOut(animationSpec = tween(${Math.round(durationMs * 0.75)})) + shrinkVertically()\n` +
           `) {\n` +
           `    ${content}\n` +
           `}`;
  }

  /**
   * Generates an infinite looping animation using rememberInfiniteTransition.
   * @param {Object} [options={}]
   * @returns {string} Kotlin snippet
   */
  static generateInfiniteTransition(options = {}) {
    const initialValue = options.initialValue !== undefined ? options.initialValue : '1f';
    const targetValue = options.targetValue !== undefined ? options.targetValue : '1.1f';
    const durationMs = options.durationMs || 1000;
    const label = options.label || 'pulse';

    return `val infiniteTransition = rememberInfiniteTransition(label = "${label}")\n` +
           `val ${label}Scale by infiniteTransition.animateFloat(\n` +
           `    initialValue = ${initialValue},\n` +
           `    targetValue = ${targetValue},\n` +
           `    animationSpec = infiniteRepeatable(animation = tween(${durationMs}), repeatMode = RepeatMode.Reverse),\n` +
           `    label = "scale"\n` +
           `)`;
  }

  /**
   * Emits the TouchTarget.kt Kotlin helper file for the target project.
   * @param {string} packageName
   * @returns {string} Kotlin source code
   */
  static generateTouchTargetKotlinFile(packageName = 'com.claude.compose.motion') {
    return `package ${packageName}

import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Material 3 Touch Target Compliance utilities guaranteeing minimum 48dp bounding box.
 */
val MinimumTouchTargetSize: Dp = 48.dp

/**
 * Enforces Material 3 recommended 48dp minimum interactive component size.
 */
fun Modifier.enforceTouchTarget(): Modifier = this.minimumInteractiveComponentSize()

/**
 * Enforces explicit minimum interactive bounding box of 48dp x 48dp.
 */
fun Modifier.touchTargetSize(): Modifier = this.sizeIn(
    minWidth = MinimumTouchTargetSize,
    minHeight = MinimumTouchTargetSize
)
`;
  }

  /**
   * Emits the MotionTokens.kt Kotlin helper file containing duration and easing specs.
   * @param {string} packageName
   * @returns {string} Kotlin source code
   */
  static generateMotionTokensKotlinFile(packageName = 'com.claude.compose.motion') {
    return `package ${packageName}

import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween

object MotionTokens {
    const val DurationShort1: Int = 50
    const val DurationShort2: Int = 100
    const val DurationMedium1: Int = 200
    const val DurationMedium2: Int = 250
    const val DurationLong1: Int = 300
    const val DurationLong2: Int = 400

    val EasingStandard = FastOutSlowInEasing
    val EasingLinear = LinearEasing
    val EasingIn = FastOutLinearInEasing
    val EasingOut = LinearOutSlowInEasing

    fun <T> defaultSpring() = spring<T>(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMediumLow
    )

    fun <T> standardTween(durationMillis: Int = DurationMedium2) = tween<T>(
        durationMillis = durationMillis,
        easing = EasingStandard
    )
}
`;
  }
}

module.exports = {
  MotionGenerator,
  mapCssEasing: MotionGenerator.mapCssEasing,
  resolveAnimationSpec: MotionGenerator.resolveAnimationSpec,
  validateSpringParams: MotionGenerator.validateSpringParams,
  validateTargetDimensions: MotionGenerator.validateTargetDimensions,
  calculateEffectiveTarget: MotionGenerator.calculateEffectiveTarget,
  ensureCompliantTouchTarget: MotionGenerator.ensureCompliantTouchTarget,
  generateRippleModifier: MotionGenerator.generateRippleModifier,
  generatePressedElevation: MotionGenerator.generatePressedElevation,
  generateAnimatedVisibility: MotionGenerator.generateAnimatedVisibility,
  generateInfiniteTransition: MotionGenerator.generateInfiniteTransition,
  generateTouchTargetKotlinFile: MotionGenerator.generateTouchTargetKotlinFile,
  generateMotionTokensKotlinFile: MotionGenerator.generateMotionTokensKotlinFile
};
