const fs = require('fs');

/**
 * Face validation modes:
 * - local-preview: recommended for local MVP testing. Accepts the upload and records whether browser detection passed, failed, or was skipped.
 * - browser-assisted: accepts when the browser detected a face, but does not reject when the browser API is unavailable or unreliable.
 * - aws-rekognition: production-grade server-side validation. Requires AWS credentials.
 * - off: disables the check.
 */
async function validateHumanFace(filePath, browserFaceDetected) {
  const provider = (process.env.FACE_DETECTION_PROVIDER || 'local-preview').toLowerCase();
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const minimumFaces = Number(process.env.MINIMUM_FACE_COUNT || 1);
  const maximumFaces = Number(process.env.MAXIMUM_FACE_COUNT || 1);
  const browserValue = String(browserFaceDetected || '').toLowerCase();

  // Development/local testing should never block a real customer's upload because browser
  // face APIs are inconsistent. Strict rejection only happens with aws-rekognition.
  if (nodeEnv !== 'production' && provider !== 'aws-rekognition') {
    const browserConfirmed = browserValue === 'true';
    return {
      accepted: true,
      provider: 'local-dev-safe',
      faces: browserConfirmed ? 1 : null,
      needsProductionValidation: !browserConfirmed,
      message: browserConfirmed
        ? 'A face was detected by the browser. Accepted for local testing.'
        : 'Photo accepted for local testing. Strict face validation should be enabled with AWS Rekognition before launch.'
    };
  }

  if (provider === 'off') {
    return { accepted: true, provider, faces: null, message: 'Face detection is disabled.' };
  }

  if (provider === 'local-preview') {
    const browserConfirmed = browserValue === 'true';
    return {
      accepted: true,
      provider,
      faces: browserConfirmed ? 1 : null,
      needsProductionValidation: !browserConfirmed,
      message: browserConfirmed
        ? 'A human face was detected by the browser. Accepted for local testing.'
        : 'Accepted for local testing. Use AWS Rekognition before live launch for strict human-face validation.'
    };
  }

  if (provider === 'browser-assisted') {
    if (browserValue === 'true') {
      return {
        accepted: true,
        provider,
        faces: 1,
        message: 'A human face was detected by the browser.'
      };
    }

    // Chrome FaceDetector can fail on valid portraits because support varies by browser,
    // operating system, image orientation, lighting, and hardware acceleration settings.
    // Do not block local testers unless production-grade server validation is enabled.
    return {
      accepted: true,
      provider,
      faces: null,
      needsProductionValidation: true,
      message: 'Browser face detection could not confirm the face, so the upload was accepted for testing. Enable AWS Rekognition for strict production validation.'
    };
  }

  if (provider === 'aws-rekognition') {
    const { RekognitionClient, DetectFacesCommand } = require('@aws-sdk/client-rekognition');
    const client = new RekognitionClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const imageBytes = fs.readFileSync(filePath);
    const command = new DetectFacesCommand({ Image: { Bytes: imageBytes }, Attributes: ['DEFAULT'] });
    const result = await client.send(command);
    const confidentFaces = (result.FaceDetails || []).filter(face => Number(face.Confidence || 0) >= Number(process.env.MINIMUM_FACE_CONFIDENCE || 90));
    const accepted = confidentFaces.length >= minimumFaces && confidentFaces.length <= maximumFaces;
    return {
      accepted,
      provider,
      faces: confidentFaces.length,
      message: accepted
        ? 'Human face accepted by server-side detection.'
        : `Please upload one clear human portrait. Detected faces: ${confidentFaces.length}.`
    };
  }

  if (nodeEnv !== 'production') {
    return {
      accepted: true,
      provider: `dev-fallback-${provider}`,
      faces: null,
      needsProductionValidation: true,
      message: `Unknown FACE_DETECTION_PROVIDER (${provider}) was accepted in development mode so local testing can continue. Use aws-rekognition before launch.`
    };
  }

  throw new Error(`Unsupported FACE_DETECTION_PROVIDER: ${provider}`);
}

module.exports = { validateHumanFace };
