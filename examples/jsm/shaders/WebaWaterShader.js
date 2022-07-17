import {
	Matrix4,
	Vector2
} from '../../../build/three.module.js';
/**
 * References:
 * https://lettier.github.io/3d-game-shaders-for-beginners/screen-space-reflection.html
 */

var WebaWaterSSRShader = {

	defines: {
		MAX_STEP: 0,
		PERSPECTIVE_CAMERA: true,
		DISTANCE_ATTENUATION: true,
		FRESNEL: true,
		INFINITE_THICK: false,
		SELECTIVE: false,
	},

	uniforms: {

		'tDiffuse': { value: null },
		'tNormal': { value: null },
		'tMetalness': { value: null },
		'tDepth': { value: null },
		'cameraNear': { value: null },
		'cameraFar': { value: null },
		'resolution': { value: new Vector2() },
		'cameraProjectionMatrix': { value: new Matrix4() },
		'cameraInverseProjectionMatrix': { value: new Matrix4() },
		'opacity': { value: .5 },
		'maxDistance': { value: 180 },
		'cameraRange': { value: 0 },
		'thickness': { value: .018 },
		'uTime': { value: 0 },
		'distortionTexture': { value: null }
	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

	fragmentShader: /* glsl */`
		// precision highp float;
		precision highp sampler2D;

		uniform sampler2D distortionTexture;

		varying vec2 vUv;
		uniform float uTime;
		uniform sampler2D tDepth;
		uniform sampler2D tNormal;
		uniform sampler2D tMetalness;
		uniform sampler2D tDiffuse;
		uniform float cameraRange;
		uniform vec2 resolution;
		uniform float opacity;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform float maxDistance;
		uniform float thickness;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraInverseProjectionMatrix;
		#include <packing>
		float pointToLineDistance(vec3 x0, vec3 x1, vec3 x2) {
			//x0: point, x1: linePointA, x2: linePointB
			//https://mathworld.wolfram.com/Point-LineDistance3-Dimensional.html
			return length(cross(x0-x1,x0-x2))/length(x2-x1);
		}
		float pointPlaneDistance(vec3 point,vec3 planePoint,vec3 planeNormal){
			// https://mathworld.wolfram.com/Point-PlaneDistance.html
			//// https://en.wikipedia.org/wiki/Plane_(geometry)
			//// http://paulbourke.net/geometry/pointlineplane/
			float a=planeNormal.x,b=planeNormal.y,c=planeNormal.z;
			float x0=point.x,y0=point.y,z0=point.z;
			float x=planePoint.x,y=planePoint.y,z=planePoint.z;
			float d=-(a*x+b*y+c*z);
			float distance=(a*x0+b*y0+c*z0+d)/sqrt(a*a+b*b+c*c);
			return distance;
		}
		float linearize_depth(in float depth){
			float a = cameraFar / (cameraFar - cameraNear);
			float b = cameraFar * cameraNear / (cameraNear - cameraFar);
			return a + b / depth;
		}
		
		float reconstruct_depth(const in vec2 uv){
			float depth = texture2D(tDepth, uv).x;
			return pow(2.0, depth * log2(cameraFar + 1.0)) - 1.0;
		}
		
		float getDepth(vec2 uv) {
			#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
				return linearize_depth(reconstruct_depth(uv));
			#else
				return texture2D(tDepth, uv).x;
			#endif
		}
		// float getDepth( const in vec2 uv ) {
		// 	return texture2D( tDepth, uv ).x;
		// }
		float getViewZ( const in float depth ) {
			#ifdef PERSPECTIVE_CAMERA
				return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );
			#else
				return orthographicDepthToViewZ( depth, cameraNear, cameraFar );
			#endif
		}
		vec3 getViewPosition( const in vec2 uv, const in float depth/*clip space*/, const in float clipW ) {
			vec4 clipPosition = vec4( ( vec3( uv, depth ) - 0.5 ) * 2.0, 1.0 );//ndc
			clipPosition *= clipW; //clip
			return ( cameraInverseProjectionMatrix * clipPosition ).xyz;//view
		}
		vec3 getViewNormal( const in vec2 uv ) {
			return unpackRGBToNormal( texture2D( tNormal, uv ).xyz );
		}
		vec2 viewPositionToXY(vec3 viewPosition){
			vec2 xy;
			vec4 clip=cameraProjectionMatrix*vec4(viewPosition,1);
			xy=clip.xy;//clip
			float clipW=clip.w;
			xy/=clipW;//NDC
			xy=(xy+1.)/2.;//uv
			xy*=resolution;//screen
			return xy;
		}

		float frac(float v){
			return v - floor(v);
		}
		vec3 FlowUVW (vec2 uv, vec2 flowVector, vec2 jump, float flowOffset, float tiling, float time,  bool flowB) {
			float phaseOffset = flowB ? 0.5 : 0.;
			float progress = frac(time + phaseOffset);
			vec3 uvw;
			uvw.xy = uv - flowVector * (progress + flowOffset);
			uvw.xy *= tiling;
			uvw.xy += phaseOffset;
			uvw.xy += (time - progress) * jump;
			uvw.z = 1. - abs(1. - 2. * progress);
			return uvw;
		}

		void main(){
			#ifdef SELECTIVE
				float metalness=texture2D(tMetalness,vUv).r;
				if(metalness==0.) return;
			#endif

			// v1
			vec3 distortion = (texture2D(distortionTexture, vec2(0.5 * vUv.x + uTime / 10., 3. * vUv.y) * 1.).rgb) * 0.025;
			vec3 distortion2 = (texture2D(distortionTexture, vec2(0.3 * -vUv.x - uTime / 30., 0.1 * vUv.y - uTime / 30.)).rgb) * 0.025;
			vec3 reflectUv = distortion + distortion2;
			reflectUv = clamp(reflectUv, 0.001, 0.999);

			// v2
			// vec2 flowmap = texture2D(distortionTexture, vUv / 20.).rg * 2. - 1.;
			// flowmap *= 0.15;
			// float noise = texture2D(distortionTexture, vUv).a;
			// float time = uTime * 1. + noise;
			// vec2 jump = vec2(0.24, 0.208);
			// vec3 uvwA = FlowUVW(vUv, flowmap, jump, -1.5, 2., time, false);
			// vec3 uvwB = FlowUVW(vUv, flowmap, jump, -1.5, 2., time, true);

			// vec2 texA = (texture2D(distortionTexture, uvwA.xy) * uvwA.z).rg;
            // vec2 texB = (texture2D(distortionTexture, uvwB.xy) * uvwB.z).rg;
			// vec2 reflectUv = (vUv + texA.rg + texB.rg) * 0.5;

			float depth = getDepth( vUv );
			float viewZ = getViewZ( depth );
			if(-viewZ>=cameraFar) return;

			float clipW = cameraProjectionMatrix[2][3] * viewZ+cameraProjectionMatrix[3][3];
			vec3 viewPosition=getViewPosition( vUv, depth, clipW );

			vec2 d0=gl_FragCoord.xy;
			vec2 d1;

			vec3 viewNormal=getViewNormal( vUv ) + reflectUv;
			viewNormal.y = abs(viewNormal.y);
			#ifdef PERSPECTIVE_CAMERA
				vec3 viewIncidentDir=normalize(viewPosition);
				vec3 viewReflectDir=reflect(viewIncidentDir,viewNormal);
			#else
				vec3 viewIncidentDir=vec3(0,0,-1);
				vec3 viewReflectDir=reflect(viewIncidentDir,viewNormal);
			#endif

			float maxReflectRayLen=maxDistance/dot(-viewIncidentDir,viewNormal);
			// dot(a,b)==length(a)*length(b)*cos(theta) // https://www.mathsisfun.com/algebra/vectors-dot-product.html
			// if(a.isNormalized&&b.isNormalized) dot(a,b)==cos(theta)
			// maxDistance/maxReflectRayLen=cos(theta)
			// maxDistance/maxReflectRayLen==dot(a,b)
			// maxReflectRayLen==maxDistance/dot(a,b)

			vec3 d1viewPosition=viewPosition+viewReflectDir*maxReflectRayLen;
			#ifdef PERSPECTIVE_CAMERA
				if(d1viewPosition.z>-cameraNear){
					//https://tutorial.math.lamar.edu/Classes/CalcIII/EqnsOfLines.aspx
					float t=(-cameraNear-viewPosition.z)/viewReflectDir.z;
					d1viewPosition=viewPosition+viewReflectDir*t;
				}
			#endif
			d1=viewPositionToXY(d1viewPosition);

			float totalLen=length(d1-d0);
			float xLen=d1.x-d0.x;
			float yLen=d1.y-d0.y;
			float totalStep=max(abs(xLen),abs(yLen));
			float xSpan=xLen/totalStep;
			float ySpan=yLen/totalStep;
			for(float i=0.;i<float(MAX_STEP);i++){
				if(i>=totalStep) break;
				vec2 xy=vec2(d0.x+i*xSpan,d0.y+i*ySpan);
				if(xy.x<0.||xy.x>resolution.x||xy.y<0.||xy.y>resolution.y) break;
				float s=length(xy-d0)/totalLen;
				vec2 uv=xy/resolution;

				float d = getDepth(uv);
				float vZ = getViewZ( d );
				if(-vZ>=cameraFar) continue;
				float cW = cameraProjectionMatrix[2][3] * vZ+cameraProjectionMatrix[3][3];
				vec3 vP=getViewPosition( uv, d, cW );

				#ifdef PERSPECTIVE_CAMERA
					// https://comp.nus.edu.sg/~lowkl/publications/lowk_persp_interp_techrep.pdf
					float recipVPZ=1./viewPosition.z;
					float viewReflectRayZ=1./(recipVPZ+s*(1./d1viewPosition.z-recipVPZ));
				#else
					float viewReflectRayZ=viewPosition.z+s*(d1viewPosition.z-viewPosition.z);
				#endif

				// if(viewReflectRayZ>vZ) continue; // will cause "npm run make-screenshot webgl_postprocessing_ssr" high probability hang.
				// https://github.com/mrdoob/three.js/pull/21539#issuecomment-821061164
				if(viewReflectRayZ<=vZ){

					bool hit;
					#ifdef INFINITE_THICK
						hit=true;
					#else
						float away=pointToLineDistance(vP,viewPosition,d1viewPosition);

						float minThickness;
						vec2 xyNeighbor=xy;
						xyNeighbor.x+=1.;
						vec2 uvNeighbor=xyNeighbor/resolution;
						vec3 vPNeighbor=getViewPosition(uvNeighbor,d,cW);
						minThickness=vPNeighbor.x-vP.x;
						minThickness*=3.;
						float tk=max(minThickness,thickness);

						hit=away<=tk;
					#endif

					if(hit){
						vec3 vN=getViewNormal( uv );
						if(dot(viewReflectDir,vN)>=0.) continue;
						float distance=pointPlaneDistance(vP,viewPosition,viewNormal);
						if(distance>maxDistance) break;
						float op=opacity;
						#ifdef DISTANCE_ATTENUATION
							float ratio=1.-(distance/maxDistance);
							float attenuation=ratio*ratio;
							op=opacity*attenuation;
						#endif
						#ifdef FRESNEL
							float fresnelCoe=(dot(viewIncidentDir,viewReflectDir)+1.)/2.;
							op*=fresnelCoe;
						#endif
						

						vec4 reflectColor=texture2D(tDiffuse,uv);
						gl_FragColor.xyz=reflectColor.xyz;
						gl_FragColor.a=op;
						break;
					}
				}
			}
		}
	`

};

var WebaWaterSSRDepthShader = {

	defines: {
		'PERSPECTIVE_CAMERA': 1
	},

	uniforms: {

		'tDepth': { value: null },
		'cameraNear': { value: null },
		'cameraFar': { value: null },

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

	fragmentShader: /* glsl */`

		uniform sampler2D tDepth;

		uniform float cameraNear;
		uniform float cameraFar;

		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 uv ) {

			#if PERSPECTIVE_CAMERA == 1

				float fragCoordZ = texture2D( tDepth, uv ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );

			#else

				return texture2D( tDepth, uv ).x;

			#endif

		}

		void main() {

			float depth = getLinearDepth( vUv );
			float d = 1.0 - depth;
			// d=(d-.999)*1000.;
			gl_FragColor = vec4( vec3( d ), 1.0 );

		}

	`

};

var WebaWaterSSRBlurShader = {

	uniforms: {

		'tDiffuse': { value: null },
		'resolution': { value: new Vector2() },
		'opacity': { value: .5 },

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

	fragmentShader: /* glsl */`

		uniform sampler2D tDiffuse;
		uniform vec2 resolution;
		varying vec2 vUv;
		void main() {
			//reverse engineering from PhotoShop blur filter, then change coefficient

			vec2 texelSize = ( 1.0 / resolution );

			vec4 c=texture2D(tDiffuse,vUv);

			vec2 offset;

			offset=(vec2(-1,0))*texelSize * 20.;
			vec4 cl=texture2D(tDiffuse,vUv+offset);

			offset=(vec2(1,0))*texelSize;
			vec4 cr=texture2D(tDiffuse,vUv+offset);

			offset=(vec2(0,-1))*texelSize;
			vec4 cb=texture2D(tDiffuse,vUv+offset);

			offset=(vec2(0,1))*texelSize;
			vec4 ct=texture2D(tDiffuse,vUv+offset);

			// float coeCenter=.5;
			// float coeSide=.125;
			float coeCenter=.2;
			float coeSide=.2;
			float a=c.a*coeCenter+cl.a*coeSide+cr.a*coeSide+cb.a*coeSide+ct.a*coeSide;
			vec3 rgb=(c.rgb*c.a*coeCenter+cl.rgb*cl.a*coeSide+cr.rgb*cr.a*coeSide+cb.rgb*cb.a*coeSide+ct.rgb*ct.a*coeSide)/a;
			gl_FragColor=vec4(rgb,a);

		}
	`


};

var WebaWaterEdgeHBlurShader = {

	uniforms: {

		'tDiffuse': { value: null },
		'tMask': { value: null },
		'h': { value: 0 },

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

	fragmentShader: /* glsl */`

		uniform sampler2D tDiffuse;
		uniform sampler2D tMask;
		uniform float h;
		varying vec2 vUv;
		void main() {

			vec4 sum = vec4( 0.0 );
			vec2 uv;
			float mask;
			
			uv = vec2( vUv.x - 4.0 * h, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.051 * mask;
			
			uv = vec2( vUv.x - 3.0 * h, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.0918 * mask;
			
			uv = vec2( vUv.x - 2.0 * h, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.12245 * mask;
			
			uv = vec2( vUv.x - 1.0 * h, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.1531 * mask;
			
			uv = vec2( vUv.x, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.1633 * mask;
			
			uv = vec2( vUv.x + 1.0 * h, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.1531 * mask;
			
			uv = vec2( vUv.x + 2.0 * h, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.12245 * mask;
			
			uv = vec2( vUv.x + 3.0 * h, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.0918 * mask;
			
			uv = vec2( vUv.x + 4.0 * h, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.051 * mask;

			gl_FragColor = sum;

		}
	`


};

var WebaWaterEdgeVBlurShader = {

	uniforms: {

		'tDiffuse': { value: null },
		'tMask': { value: null },
		'v': { value: 0 },

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

	fragmentShader: /* glsl */`

		uniform sampler2D tDiffuse;
		uniform sampler2D tMask;
		uniform float v;

		varying vec2 vUv;

		void main() {

			vec4 sum = vec4( 0.0 );
			vec2 uv;
			float mask;
			
			uv = vec2( vUv.x, vUv.y - 4.0 * v );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.051 * mask;
			
			uv = vec2( vUv.x, vUv.y - 3.0 * v );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.0918 * mask;
			
			uv = vec2( vUv.x, vUv.y - 2.0 * v );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.12245 * mask;
			
			uv = vec2( vUv.x, vUv.y - 1.0 * v );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.1531 * mask;
			
			uv = vec2( vUv.x, vUv.y );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.1633 * mask;
			
			uv = vec2( vUv.x, vUv.y + 1.0 * v );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.1531 * mask;
			
			uv = vec2( vUv.x, vUv.y + 2.0 * v );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.12245 * mask;
			
			uv = vec2( vUv.x, vUv.y + 3.0 * v );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.0918 * mask;
			
			uv = vec2( vUv.x, vUv.y + 4.0 * v );
			mask = texture2D( tMask, uv ).r;
			sum += texture2D( tDiffuse, uv ) * 0.051 * mask;

			gl_FragColor = sum;

		}
	`


};

var WebaWaterMaskShader = {

	uniforms: {

		'tDiffuse': { value: null },
		'tMask': { value: null },

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}

	`,

	fragmentShader: /* glsl */`

		uniform sampler2D tDiffuse;
		uniform sampler2D tMask;

		varying vec2 vUv;

		void main() {

			vec4 diffuse = texture2D( tDiffuse, vUv );
			float mask = texture2D( tMask, vUv ).r;

			float fadeSpan = 0.3;
			float leftFade = 1. - vUv.x / fadeSpan;
			float rightFade = (vUv.x - (1. - fadeSpan)) / fadeSpan;

			gl_FragColor.rgb = diffuse.rgb;
			gl_FragColor.a = min(mask, max(leftFade, rightFade));
			// gl_FragColor.a = 1. - gl_FragColor.r;

		}
	`


};
var WebaWaterBlankShader = {
	vertexShader: /* glsl */`
		void main() {
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}

	`,

	fragmentShader: /* glsl */`
		void main() {
			gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
		}
	`


};

var WebaWaterCombineShader = {

	uniforms: {
		'time': { value: 0 },
		'tDiffuse': { value: null },
		'tMask': { value: null },
		'tDepth': { value: null },
		'tPlayer': { value: null },
		'dudvMap': { value: null },
		'resolution': { value: new Vector2()},
		'cameraInverseProjectionMatrix': { value: new Matrix4() },
		'uMatrixWorld': { value: new Matrix4() },
		

	},

	vertexShader: /* glsl */`

		varying vec2 vUv;
		varying vec3 vPos;

		void main() {

			vUv = uv;
			vPos = position;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			

		}

	`,

	fragmentShader: /* glsl */`
	#include <common>
	#include <packing>
		uniform mat4 cameraInverseProjectionMatrix;
		uniform mat4 uMatrixWorld;
		

		uniform sampler2D tDiffuse;
		uniform sampler2D tMask;
		uniform sampler2D tPlayer;
		uniform sampler2D dudvMap;
		uniform sampler2D tDepth;
		uniform vec2 resolution;
		uniform float time;

		varying vec2 vUv;
		varying vec3 vPos;

		void main() {
			vec4 diffuse = texture2D( tDiffuse, vUv );
			vec4 mask = texture2D( tMask, vUv );
			vec4 player = texture2D( tPlayer, vUv );

			float normalizedDepth = unpackRGBAToDepth(  texture2D( tDepth, gl_FragCoord.xy / resolution) ); 
			vec4 ndc = vec4(
				(vUv.x - 0.5) * 2.0,
				(vUv.y - 0.5) * 2.0,
				(normalizedDepth - 0.5) * 2.0,
				1.0);

			
			vec4 clip = cameraInverseProjectionMatrix * ndc;
			vec4 view = uMatrixWorld * (clip / clip.w);
			vec3 worldPos = view.xyz;
			

			if(mask.a > 0.1 && mask.r < 1. && player.r > 0.1){
                float diff = mask.r;


				vec2 channelA = texture2D( dudvMap, vec2(0.25 * worldPos.x + time * 0.08, 0.5 * worldPos.z - time * 0.05) ).rg;
				vec2 channelB = texture2D( dudvMap, vec2(0.5 * worldPos.x - time * 0.07, 0.35 * worldPos.z + time * 0.06) ).rg;

                vec2 displacement = (channelA + channelB) * 0.5;
                displacement = ( ( displacement * 2.0 ) - 1.0 ) * 1.0;
                diff += displacement.x;
        
                gl_FragColor = mix( vec4(1.0, 1.0, 1.0, diffuse.a), diffuse, step( 0.5, diff ) );
			}
			else{
				gl_FragColor = diffuse;
			}
		}
	`


};

export { WebaWaterSSRShader, WebaWaterSSRDepthShader, WebaWaterSSRBlurShader, WebaWaterEdgeHBlurShader, WebaWaterEdgeVBlurShader, WebaWaterMaskShader, WebaWaterBlankShader, WebaWaterCombineShader };