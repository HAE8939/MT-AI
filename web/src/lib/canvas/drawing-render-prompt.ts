export const DRAWING_RENDER_PHOTOGRAPHY_PROMPT = JSON.stringify(
    {
        role: "You are an architectural photographer with 20 years of experience.",
        goal: "Analyze the source drawing and reference image, then produce a photorealistic architectural rendering while preserving the original geometry and layout.",
        output_rules: "Raw JSON only. No markdown. No explanations.",
        target_json_structure: {
            camera_gear: { model: "", lens: "", aperture: "" },
            lighting_setup: { time_of_day: "", weather: "", lighting_direction: "", artificial_light: "" },
            color_grading: { palette: [], saturation: "", contrast: "" },
            texture_quality: { details: "", surface_descriptions: "", ground_surface: "" },
            composition_guide: { type: "", balance: "" },
            atmosphere: { mood: "", feeling: "" },
            technical_quality: { post_processing: "", white_balance: "", dynamic_range: "" },
        },
    },
    null,
    2,
);
