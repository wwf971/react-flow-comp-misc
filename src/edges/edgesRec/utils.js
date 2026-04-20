export const DIR_UP = 'up';
export const DIR_DOWN = 'down';
export const DIR_LEFT = 'left';
export const DIR_RIGHT = 'right';

export function getDirectionPlanByCaseKey(caseKey) {
  switch (caseKey) {
    case 'topRight|up|up':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|up|down':
      return [DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|up|left':
      return [DIR_UP, DIR_RIGHT];
    case 'topRight|up|right':
      return [DIR_UP, DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|up|horizontal':
      return [DIR_UP, DIR_RIGHT];
    case 'topRight|up|vertical':
      return [DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|down|up':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|down|down':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'topRight|down|left':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|down|right':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|down|horizontal':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|down|vertical':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'topRight|left|up':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|left|down':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|left|left':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topRight|left|right':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|left|horizontal':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topRight|left|vertical':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|right|up':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|right|down':
      return [DIR_RIGHT, DIR_UP];
    case 'topRight|right|left':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|right|right':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|right|horizontal':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|right|vertical':
      return [DIR_RIGHT, DIR_UP];
    case 'topRight|horizontal|up':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|horizontal|down':
      return [DIR_RIGHT, DIR_UP];
    case 'topRight|horizontal|left':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|horizontal|right':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|horizontal|horizontal':
      return [DIR_RIGHT, DIR_UP, DIR_RIGHT];
    case 'topRight|horizontal|vertical':
      return [DIR_RIGHT, DIR_UP];
    case 'topRight|vertical|up':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'topRight|vertical|down':
      return [DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topRight|vertical|left':
      return [DIR_UP, DIR_RIGHT];
    case 'topRight|vertical|right':
      return [DIR_UP, DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topRight|vertical|horizontal':
      return [DIR_UP, DIR_RIGHT];
    case 'topRight|vertical|vertical':
      return [DIR_UP, DIR_RIGHT, DIR_UP];
    case 'topLeft|up|up':
      return [DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|up|down':
      return [DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|up|left':
      return [DIR_UP, DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|up|right':
      return [DIR_UP, DIR_LEFT];
    case 'topLeft|up|horizontal':
      return [DIR_UP, DIR_LEFT];
    case 'topLeft|up|vertical':
      return [DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|down|up':
      return [DIR_DOWN, DIR_LEFT, DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|down|down':
      return [DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'topLeft|down|left':
      return [DIR_DOWN, DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|down|right':
      return [DIR_DOWN, DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|down|horizontal':
      return [DIR_DOWN, DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|down|vertical':
      return [DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'topLeft|left|up':
      return [DIR_LEFT, DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|left|down':
      return [DIR_LEFT, DIR_UP];
    case 'topLeft|left|left':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|left|right':
      return [DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|left|horizontal':
      return [DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|left|vertical':
      return [DIR_LEFT, DIR_UP];
    case 'topLeft|right|up':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|right|down':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|right|left':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|right|right':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topLeft|right|horizontal':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT];
    case 'topLeft|right|vertical':
      return [DIR_RIGHT, DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|horizontal|up':
      return [DIR_LEFT, DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|horizontal|down':
      return [DIR_LEFT, DIR_UP];
    case 'topLeft|horizontal|left':
      return [DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|horizontal|right':
      return [DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|horizontal|horizontal':
      return [DIR_LEFT, DIR_UP, DIR_LEFT];
    case 'topLeft|horizontal|vertical':
      return [DIR_LEFT, DIR_UP];
    case 'topLeft|vertical|up':
      return [DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'topLeft|vertical|down':
      return [DIR_UP, DIR_LEFT, DIR_UP];
    case 'topLeft|vertical|left':
      return [DIR_UP, DIR_LEFT, DIR_UP, DIR_RIGHT];
    case 'topLeft|vertical|right':
      return [DIR_UP, DIR_LEFT];
    case 'topLeft|vertical|horizontal':
      return [DIR_UP, DIR_LEFT];
    case 'topLeft|vertical|vertical':
      return [DIR_UP, DIR_LEFT, DIR_UP];
    case 'bottomRight|up|up':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|up|down':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|up|left':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|up|right':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|up|horizontal':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|up|vertical':
      return [DIR_UP, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|down|up':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|down|down':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|down|left':
      return [DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|down|right':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|down|horizontal':
      return [DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|down|vertical':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|left|up':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|left|down':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|left|left':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|left|right':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|left|horizontal':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|left|vertical':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|right|up':
      return [DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|right|down':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|right|left':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|right|right':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|right|horizontal':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|right|vertical':
      return [DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|horizontal|up':
      return [DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|horizontal|down':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|horizontal|left':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|horizontal|right':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|horizontal|horizontal':
      return [DIR_RIGHT, DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|horizontal|vertical':
      return [DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|vertical|up':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomRight|vertical|down':
      return [DIR_DOWN, DIR_RIGHT, DIR_UP];
    case 'bottomRight|vertical|left':
      return [DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|vertical|right':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomRight|vertical|horizontal':
      return [DIR_DOWN, DIR_RIGHT];
    case 'bottomRight|vertical|vertical':
      return [DIR_DOWN, DIR_RIGHT, DIR_DOWN];
    case 'bottomLeft|up|up':
      return [DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|up|down':
      return [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|up|left':
      return [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|up|right':
      return [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|up|horizontal':
      return [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|up|vertical':
      return [DIR_UP, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|down|up':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|down|down':
      return [DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|down|left':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|down|right':
      return [DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|down|horizontal':
      return [DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|down|vertical':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|left|up':
      return [DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|left|down':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|left|left':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|left|right':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|left|horizontal':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|left|vertical':
      return [DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|right|up':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|right|down':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|right|left':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|right|right':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|right|horizontal':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|right|vertical':
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|horizontal|up':
      return [DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|horizontal|down':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|horizontal|left':
      return [DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|horizontal|right':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|horizontal|horizontal':
      return [DIR_LEFT, DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|horizontal|vertical':
      return [DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|vertical|up':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN];
    case 'bottomLeft|vertical|down':
      return [DIR_DOWN, DIR_LEFT, DIR_UP];
    case 'bottomLeft|vertical|left':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN, DIR_RIGHT];
    case 'bottomLeft|vertical|right':
      return [DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|vertical|horizontal':
      return [DIR_DOWN, DIR_LEFT];
    case 'bottomLeft|vertical|vertical':
      return [DIR_DOWN, DIR_LEFT, DIR_DOWN];
    default:
      return [DIR_RIGHT, DIR_DOWN, DIR_LEFT];
  }
}