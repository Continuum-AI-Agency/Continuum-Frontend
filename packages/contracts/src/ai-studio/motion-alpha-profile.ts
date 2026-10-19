/** Exact sizes measured through AE 26 ProRes replacement renders. Other sizes need a new consumer proof. */
export const MOTION_FORGE_COLOR_MATRIX_RECIPES = [
  { width: 128, height: 128, matrix: 'bt601' },
  { width: 320, height: 180, matrix: 'bt601' },
  { width: 720, height: 576, matrix: 'bt601' },
  { width: 1280, height: 360, matrix: 'bt601' },
  { width: 720, height: 720, matrix: 'bt709' },
  { width: 1280, height: 720, matrix: 'bt709' },
  { width: 1920, height: 1080, matrix: 'bt709' },
  { width: 720, height: 1280, matrix: 'bt709' },
  { width: 1080, height: 1080, matrix: 'bt709' },
] as const;

export function motionForgeColorMatrix(width: number, height: number): 'bt601' | 'bt709' | null {
  return (
    MOTION_FORGE_COLOR_MATRIX_RECIPES.find(
      (recipe) => recipe.width === width && recipe.height === height,
    )?.matrix ?? null
  );
}
