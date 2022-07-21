import {
	AddEquation,
	Color,
	NormalBlending,
	DepthTexture,
	SrcAlphaFactor,
	OneMinusSrcAlphaFactor,
	MeshNormalMaterial,
	MeshBasicMaterial,
	NearestFilter,
	NoBlending,
	RGBAFormat,
	ShaderMaterial,
	UniformsUtils,
	UnsignedShortType,
	WebGLRenderTarget,
	HalfFloatType,
	RGBADepthPacking,
	MeshDepthMaterial
} from '../../../build/three.module.js';
import { Pass, FullScreenQuad } from '../postprocessing/Pass.js';
import { WebaWaterSSRShader } from '../shaders/WebaWaterShader.js';
import { WebaWaterSSRBlurShader } from '../shaders/WebaWaterShader.js';
import { WebaWaterEdgeHBlurShader, WebaWaterEdgeVBlurShader, WebaWaterMaskShader, WebaWaterBlankShader, WebaWaterCombineShader } from '../shaders/WebaWaterShader.js';
import { CopyShader } from '../shaders/CopyShader.js';
import { DoubleSide } from 'three';

class WebaWaterPass extends Pass {

	constructor( { renderer, scene, camera, width, height, selects, bouncing = false, invisibleSelects } ) {

		super();

		this.width = ( width !== undefined ) ? width : 512;
		this.height = ( height !== undefined ) ? height : 512;

		this.clear = true;

		this.renderer = renderer;
		this.scene = scene;
		this.camera = camera;

		this.opacity = WebaWaterSSRShader.uniforms.opacity.value;
		this.output = 0;

		this.maxDistance = WebaWaterSSRShader.uniforms.maxDistance.value;
		this.thickness = WebaWaterSSRShader.uniforms.thickness.value;

		this.tempColor = new Color();

		// this.foamDepthMaterial = foamDepthMaterial;
		// this.foamRenderTarget = foamRenderTarget;

		const pixelRatio = renderer.getPixelRatio();
		this.foamRenderTarget = new WebGLRenderTarget(
			window.innerWidth * pixelRatio,
			window.innerHeight * pixelRatio
		);
		this.foamRenderTarget.texture.minFilter = NearestFilter;
		this.foamRenderTarget.texture.magFilter = NearestFilter;
		this.foamRenderTarget.texture.generateMipmaps = false;
		this.foamRenderTarget.stencilBuffer = false;

		

		this.foamDepthMaterial = new MeshDepthMaterial();
		this.foamDepthMaterial.depthPacking = RGBADepthPacking;
		this.foamDepthMaterial.blending = NoBlending;


		this.invisibleSelects = invisibleSelects;

		this._selects = selects;
		this.selective = Array.isArray( this._selects );
		
		Object.defineProperty( this, 'selects', {
			get() {

				return this._selects;

			},
			set( val ) {

				if ( this._selects === val ) return;
				this._selects = val;
				if ( Array.isArray( val ) ) {

					this.selective = true;
					this.ssrMaterial.defines.SELECTIVE = true;
					this.ssrMaterial.needsUpdate = true;

				} else {

					this.selective = false;
					this.ssrMaterial.defines.SELECTIVE = false;
					this.ssrMaterial.needsUpdate = true;

				}

			}
		} );

		this._bouncing = bouncing;
		Object.defineProperty( this, 'bouncing', {
			get() {

				return this._bouncing;

			},
			set( val ) {

				if ( this._bouncing === val ) return;
				this._bouncing = val;
				if ( val ) {

					this.ssrMaterial.uniforms[ 'tDiffuse' ].value = this.prevRenderTarget.texture;

				} else {

					// this.ssrMaterial.uniforms[ 'tDiffuse' ].value = this.beautyRenderTarget.texture;

				}

			}
		} );

		this.blur = true;

		this._distanceAttenuation = WebaWaterSSRShader.defines.DISTANCE_ATTENUATION;
		Object.defineProperty( this, 'distanceAttenuation', {
			get() {

				return this._distanceAttenuation;

			},
			set( val ) {

				if ( this._distanceAttenuation === val ) return;
				this._distanceAttenuation = val;
				this.ssrMaterial.defines.DISTANCE_ATTENUATION = val;
				this.ssrMaterial.needsUpdate = true;

			}
		} );


		this._fresnel = WebaWaterSSRShader.defines.FRESNEL;
		Object.defineProperty( this, 'fresnel', {
			get() {

				return this._fresnel;

			},
			set( val ) {

				if ( this._fresnel === val ) return;
				this._fresnel = val;
				this.ssrMaterial.defines.FRESNEL = val;
				this.ssrMaterial.needsUpdate = true;

			}
		} );

		this._infiniteThick = WebaWaterSSRShader.defines.INFINITE_THICK;
		Object.defineProperty( this, 'infiniteThick', {
			get() {

				return this._infiniteThick;

			},
			set( val ) {

				if ( this._infiniteThick === val ) return;
				this._infiniteThick = val;
				this.ssrMaterial.defines.INFINITE_THICK = val;
				this.ssrMaterial.needsUpdate = true;

			}
		} );

		//for bouncing
		this.prevRenderTarget = new WebGLRenderTarget( this.width, this.height, {
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			format: RGBAFormat,
		} );

		// normal render target with depth buffer

		const depthTexture = new DepthTexture();
		depthTexture.type = UnsignedShortType;
		depthTexture.minFilter = NearestFilter;
		depthTexture.magFilter = NearestFilter;

		this.normalRenderTarget = new WebGLRenderTarget( this.width, this.height, {
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			format: RGBAFormat,
			type: HalfFloatType,
			depthTexture: depthTexture,
			depthBuffer: true
		} );

		// metalness render target

		this.metalnessRenderTarget = new WebGLRenderTarget( this.width, this.height, {
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			format: RGBAFormat
		} );

		// ssr render target

		this.ssrRenderTarget = new WebGLRenderTarget( this.width, this.height, {
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			format: RGBAFormat
		} );

		this.blurRenderTarget = this.ssrRenderTarget.clone();
		this.blurRenderTarget2 = this.ssrRenderTarget.clone();
		this.edgeHBlurRenderTarget = this.ssrRenderTarget.clone();
		this.edgeHBlurRenderTarget2 = this.ssrRenderTarget.clone();
		this.edgeHBlurRenderTarget3 = this.ssrRenderTarget.clone();
		this.edgeHBlurRenderTarget4 = this.ssrRenderTarget.clone();
		this.edgeVBlurRenderTarget = this.ssrRenderTarget.clone();
		this.edgeVBlurRenderTarget2 = this.ssrRenderTarget.clone();
		this.edgeVBlurRenderTarget3 = this.ssrRenderTarget.clone();
		this.edgeVBlurRenderTarget4 = this.ssrRenderTarget.clone();
		this.maskRenderTarget = this.ssrRenderTarget.clone();


		// ssr material

		if ( WebaWaterSSRShader === undefined ) {

			console.error( 'THREE.WebaWaterPass: The pass relies on WebaWaterSSRShader.' );

		}

		this.ssrMaterial = new ShaderMaterial( {
			defines: Object.assign( {}, WebaWaterSSRShader.defines, {
				MAX_STEP: Math.sqrt( this.width * this.width + this.height * this.height )
			} ),
			uniforms: UniformsUtils.clone( WebaWaterSSRShader.uniforms ),
			vertexShader: WebaWaterSSRShader.vertexShader,
			fragmentShader: WebaWaterSSRShader.fragmentShader,
			blending: NoBlending
		} );

		// this.ssrMaterial.uniforms[ 'tDiffuse' ].value = this.beautyRenderTarget.texture;
		this.ssrMaterial.uniforms[ 'tNormal' ].value = this.normalRenderTarget.texture;
		this.ssrMaterial.defines.SELECTIVE = this.selective;
		this.ssrMaterial.needsUpdate = true;
		this.ssrMaterial.uniforms[ 'tMetalness' ].value = this.metalnessRenderTarget.texture;
		this.ssrMaterial.uniforms[ 'tDepth' ].value = this.normalRenderTarget.depthTexture;
		this.ssrMaterial.uniforms[ 'cameraNear' ].value = this.camera.near;
		this.ssrMaterial.uniforms[ 'cameraFar' ].value = this.camera.far;
		this.ssrMaterial.uniforms[ 'thickness' ].value = this.thickness;
		this.ssrMaterial.uniforms[ 'resolution' ].value.set( this.width, this.height );
		this.ssrMaterial.uniforms[ 'cameraProjectionMatrix' ].value.copy( this.camera.projectionMatrix );
		this.ssrMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy( this.camera.projectionMatrixInverse );

		// normal material

		this.normalMaterial = new MeshNormalMaterial({
			side: DoubleSide,
		});
		this.normalMaterial.blending = NoBlending;

		// metalnessOn material

		this.metalnessOnMaterial = new MeshBasicMaterial( {
			color: 'white',
			side: DoubleSide,
		} );

		// metalnessOff material

		this.metalnessOffMaterial = new MeshBasicMaterial( {
			color: 'black',
			side: DoubleSide,
		} );

		// blur material

		this.blurMaterial = new ShaderMaterial( {
			defines: Object.assign( {}, WebaWaterSSRBlurShader.defines ),
			uniforms: UniformsUtils.clone( WebaWaterSSRBlurShader.uniforms ),
			vertexShader: WebaWaterSSRBlurShader.vertexShader,
			fragmentShader: WebaWaterSSRBlurShader.fragmentShader
		} );
		this.blurMaterial.uniforms[ 'tDiffuse' ].value = this.ssrRenderTarget.texture;
		this.blurMaterial.uniforms[ 'resolution' ].value.set( this.width, this.height );

		// blur material 2

		this.blurMaterial2 = new ShaderMaterial( {
			defines: Object.assign( {}, WebaWaterSSRBlurShader.defines ),
			uniforms: UniformsUtils.clone( WebaWaterSSRBlurShader.uniforms ),
			vertexShader: WebaWaterSSRBlurShader.vertexShader,
			fragmentShader: WebaWaterSSRBlurShader.fragmentShader
		} );
		this.blurMaterial2.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget.texture;
		this.blurMaterial2.uniforms[ 'resolution' ].value.set( this.width, this.height );


		this.edgeHBlurMaterial  = new ShaderMaterial( {
			defines: Object.assign( {}, WebaWaterEdgeHBlurShader.defines ),
			uniforms: UniformsUtils.clone( WebaWaterEdgeHBlurShader.uniforms ),
			vertexShader: WebaWaterEdgeHBlurShader.vertexShader,
			fragmentShader: WebaWaterEdgeHBlurShader.fragmentShader
		} );
		// this.edgeHBlurMaterial .uniforms[ 'tDiffuse' ].value = this.ssrRenderTarget.texture;

		this.edgeVBlurMaterial  = new ShaderMaterial( {
			defines: Object.assign( {}, WebaWaterEdgeVBlurShader.defines ),
			uniforms: UniformsUtils.clone( WebaWaterEdgeVBlurShader.uniforms ),
			vertexShader: WebaWaterEdgeVBlurShader.vertexShader,
			fragmentShader: WebaWaterEdgeVBlurShader.fragmentShader
		} );
		// this.edgeVBlurMaterial .uniforms[ 'tDiffuse' ].value = this.ssrRenderTarget.texture;

		this.maskMaterial  = new ShaderMaterial( {
			defines: Object.assign( {}, WebaWaterMaskShader.defines ),
			uniforms: UniformsUtils.clone( WebaWaterMaskShader.uniforms ),
			vertexShader: WebaWaterMaskShader.vertexShader,
			fragmentShader: WebaWaterMaskShader.fragmentShader
		} );
		

		// material for rendering the content of a render target

		this.copyMaterial = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( CopyShader.uniforms ),
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blendSrc: SrcAlphaFactor,
			blendDst: OneMinusSrcAlphaFactor,
			blendEquation: AddEquation,
			blendSrcAlpha: SrcAlphaFactor,
			blendDstAlpha: OneMinusSrcAlphaFactor,
			blendEquationAlpha: AddEquation,
			// premultipliedAlpha:true,
		} );

		this.fsQuad = new FullScreenQuad( null );

		this.originalClearColor = new Color();

		this.blankMaterial  = new ShaderMaterial( {
			defines: Object.assign( {}, WebaWaterBlankShader.defines ),
			uniforms: UniformsUtils.clone( WebaWaterBlankShader.uniforms ),
			vertexShader: WebaWaterBlankShader.vertexShader,
			fragmentShader: WebaWaterBlankShader.fragmentShader
		} );
		this.blankRenderTarget = this.ssrRenderTarget.clone();

		this.combineMaterial  = new ShaderMaterial( {
			defines: Object.assign( {}, WebaWaterCombineShader.defines ),
			uniforms: UniformsUtils.clone( WebaWaterCombineShader.uniforms ),
			vertexShader: WebaWaterCombineShader.vertexShader,
			fragmentShader: WebaWaterCombineShader.fragmentShader,
		} );
		this.combineRenderTarget = this.ssrRenderTarget.clone();
		// this.combineMaterial.uniforms[ 'cameraNear' ].value = this.camera.near;
		// this.combineMaterial.uniforms[ 'cameraFar' ].value = this.camera.far;
		// this.combineMaterial.uniforms[ 'cameraProjectionMatrix' ].value.copy( this.camera.projectionMatrix );
		// this.combineMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy( this.camera.projectionMatrixInverse );
		// this.combineMaterial.uniforms[ 'cameraMatrixWorldInverse' ].value.copy( this.camera.matrixWorldInverse );
		

		this.playerOnMaterial = new MeshBasicMaterial( {
			color: 'white',
			side: DoubleSide,
		} );
		this.playerOffMaterial = new MeshBasicMaterial( {
			color: 'black',
			side: DoubleSide,
		} );
		this.playerRenderTarget = new WebGLRenderTarget( this.width, this.height, {
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			format: RGBAFormat
		} );

	}

	dispose() {

		// dispose render targets

		// this.beautyRenderTarget.dispose();
		this.prevRenderTarget.dispose();
		this.normalRenderTarget.dispose();
		this.metalnessRenderTarget.dispose();
		this.ssrRenderTarget.dispose();
		this.blurRenderTarget.dispose();
		this.blurRenderTarget2.dispose();
		// this.blurRenderTarget3.dispose();
		this.edgeHBlurRenderTarget.dispose();
		this.edgeHBlurRenderTarget2.dispose();
		this.edgeHBlurRenderTarget3.dispose();
		this.edgeHBlurRenderTarget4.dispose();
		this.edgeVBlurRenderTarget.dispose();
		this.edgeVBlurRenderTarget2.dispose();
		this.edgeVBlurRenderTarget3.dispose();
		this.edgeVBlurRenderTarget4.dispose();
		this.maskRenderTarget.dispose();
		this.blankRenderTarget.dispose();
		this.combineRenderTarget.dispose();

		// dispose materials

		this.normalMaterial.dispose();
		this.metalnessOnMaterial.dispose();
		this.metalnessOffMaterial.dispose();
		this.blurMaterial.dispose();
		this.blurMaterial2.dispose();
		this.edgeHBlurMaterial.dispose();
		this.edgeVBlurMaterial.dispose();
		this.maskMaterial.dispose();
		this.copyMaterial.dispose();
		this.blankMaterial.dispose();
		this.combineMaterial.dispose();

		// dipsose full screen quad

		this.fsQuad.dispose();

	}

	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {

		// render normals

		this.renderOverride( renderer, this.normalMaterial, this.normalRenderTarget, 0, 0 );

		// render metalnesses

		this.renderMetalness( renderer, this.metalnessOnMaterial, this.metalnessRenderTarget, 0, 0 );
		

		// render SSR

		this.ssrMaterial.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
		this.ssrMaterial.uniforms[ 'opacity' ].value = this.opacity;
		this.ssrMaterial.uniforms[ 'maxDistance' ].value = this.maxDistance;
		this.ssrMaterial.uniforms[ 'thickness' ].value = this.thickness;
		this.renderPass( renderer, this.ssrMaterial, this.ssrRenderTarget );

		// render blur

		if ( this.blur ) {
			this.renderPass( renderer, this.blurMaterial, this.blurRenderTarget );
			this.renderPass( renderer, this.blurMaterial2, this.blurRenderTarget2 );
		}

		switch ( this.output ) {

			case WebaWaterPass.OUTPUT.Default:

				if ( this.bouncing ) { 
					this.copyMaterial.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
					this.copyMaterial.blending = NoBlending;
					this.renderPass( renderer, this.copyMaterial, this.prevRenderTarget );

					if ( this.blur )
						this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget2.texture;
					else
						this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.ssrRenderTarget.texture;
					this.copyMaterial.blending = NormalBlending;
					this.renderPass( renderer, this.copyMaterial, this.prevRenderTarget );

					this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.prevRenderTarget.texture;
					this.copyMaterial.blending = NoBlending;
					this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				} else {
					this.copyMaterial.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
					this.copyMaterial.blending = NoBlending;
					this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

					if ( this.blur )
						this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget2.texture;
					else
						this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.ssrRenderTarget.texture;
					this.copyMaterial.blending = NormalBlending;
					this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

					this.edgeHBlurMaterial.uniforms[ 'h' ].value = 20. * 1.0 / window.innerWidth * window.devicePixelRatio;
					this.edgeHBlurMaterial.uniforms[ 'tDiffuse' ].value = writeBuffer.texture;
					this.edgeHBlurMaterial.uniforms[ 'tMask' ].value = this.metalnessRenderTarget.texture;
					this.renderPass( renderer, this.edgeHBlurMaterial, this.edgeHBlurRenderTarget);

					this.edgeHBlurMaterial.uniforms[ 'h' ].value = 13. * 1.0 / window.innerWidth * window.devicePixelRatio;
					this.edgeHBlurMaterial.uniforms[ 'tDiffuse' ].value = this.edgeHBlurRenderTarget.texture;
					this.edgeHBlurMaterial.uniforms[ 'tMask' ].value = this.metalnessRenderTarget.texture;
					this.renderPass( renderer, this.edgeHBlurMaterial, this.edgeHBlurRenderTarget2);
					
					this.edgeVBlurMaterial.uniforms[ 'v' ].value = 20. * 1.0 / window.innerHeight * window.devicePixelRatio;
					this.edgeVBlurMaterial.uniforms[ 'tDiffuse' ].value = this.edgeHBlurRenderTarget2.texture;
					this.edgeVBlurMaterial.uniforms[ 'tMask' ].value = this.metalnessRenderTarget.texture;
					this.renderPass( renderer, this.edgeVBlurMaterial, this.edgeVBlurRenderTarget);

					this.edgeVBlurMaterial.uniforms[ 'v' ].value = 13. * 1.0 / window.innerHeight * window.devicePixelRatio;
					this.edgeVBlurMaterial.uniforms[ 'tDiffuse' ].value = this.edgeVBlurRenderTarget.texture;
					this.edgeVBlurMaterial.uniforms[ 'tMask' ].value = this.metalnessRenderTarget.texture;
					this.renderPass( renderer, this.edgeVBlurMaterial, this.edgeVBlurRenderTarget2);
					
					this.maskMaterial.uniforms[ 'tDiffuse' ].value = this.edgeVBlurRenderTarget2.texture;
					this.maskMaterial.uniforms[ 'tMask' ].value = this.metalnessRenderTarget.texture;
					this.renderPass( renderer, this.maskMaterial, this.maskRenderTarget);

					this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.maskRenderTarget.texture;
					this.copyMaterial.blending = NormalBlending;
					this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );
					

					// this.renderPass( renderer, this.blankMaterial, this.blankRenderTarget );

					
					// this.edgeHBlurMaterial.uniforms[ 'h' ].value = 10. * 1.0 / window.innerWidth * window.devicePixelRatio;
					// this.edgeHBlurMaterial.uniforms[ 'tDiffuse' ].value = this.blankRenderTarget.texture;
					// this.edgeHBlurMaterial.uniforms[ 'tMask' ].value = this.metalnessRenderTarget.texture;
					// this.renderPass( renderer, this.edgeHBlurMaterial, this.edgeHBlurRenderTarget3);

					// this.edgeHBlurMaterial.uniforms[ 'h' ].value = 7. * 1.0 / window.innerWidth * window.devicePixelRatio;
					// this.edgeHBlurMaterial.uniforms[ 'tDiffuse' ].value = this.edgeHBlurRenderTarget3.texture;
					// this.edgeHBlurMaterial.uniforms[ 'tMask' ].value = this.metalnessRenderTarget.texture;
					// this.renderPass( renderer, this.edgeHBlurMaterial, this.edgeHBlurRenderTarget4);
					
					// this.edgeVBlurMaterial.uniforms[ 'v' ].value = 1. * 1.0 / window.innerHeight * window.devicePixelRatio;
					// this.edgeVBlurMaterial.uniforms[ 'tDiffuse' ].value = this.edgeHBlurRenderTarget3.texture;
					// this.edgeVBlurMaterial.uniforms[ 'tMask' ].value = this.metalnessRenderTarget.texture;
					// this.renderPass( renderer, this.edgeVBlurMaterial, this.edgeVBlurRenderTarget3);

					// this.edgeVBlurMaterial.uniforms[ 'v' ].value = 7. * 1.0 / window.innerHeight * window.devicePixelRatio;
					// this.edgeVBlurMaterial.uniforms[ 'tDiffuse' ].value = this.edgeVBlurRenderTarget3.texture;
					// this.edgeVBlurMaterial.uniforms[ 'tMask' ].value = this.metalnessRenderTarget.texture;
					// this.renderPass( renderer, this.edgeVBlurMaterial, this.edgeVBlurRenderTarget4);
					
					// this.combineMaterial.uniforms[ 'tDiffuse' ].value = this.maskRenderTarget.texture;
					// this.combineMaterial.uniforms[ 'tMask' ].value = this.edgeVBlurRenderTarget3.texture;
					// this.combineMaterial.uniforms[ 'tPlayer' ].value = this.playerRenderTarget.texture;
					// this.combineMaterial.uniforms[ 'resolution' ].value.set(
					// 	window.innerWidth * window.devicePixelRatio,
					// 	window.innerHeight * window.devicePixelRatio
					// );
					// this.combineMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy( this.camera.projectionMatrixInverse );
					// this.combineMaterial.uniforms[ 'uMatrixWorld' ].value.copy( this.camera.matrixWorld );
					
					// if(this.foamRenderTarget)
					// 	this.combineMaterial.uniforms[ 'tDepth' ].value = this.foamRenderTarget.texture;
					// this.renderPass( renderer, this.combineMaterial, this.combineRenderTarget);


					// this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.combineRenderTarget.texture;
					// this.copyMaterial.blending = NormalBlending;
					// this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );
					
				}

				break;
			case WebaWaterPass.OUTPUT.SSR:

				if ( this.blur )
					this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget2.texture;
				else
					this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.ssrRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				if ( this.bouncing ) {

					if ( this.blur )
						this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.blurRenderTarget2.texture;
					else
						this.copyMaterial.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
					this.copyMaterial.blending = NoBlending;
					this.renderPass( renderer, this.copyMaterial, this.prevRenderTarget );

					this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.ssrRenderTarget.texture;
					this.copyMaterial.blending = NormalBlending;
					this.renderPass( renderer, this.copyMaterial, this.prevRenderTarget );

				}

				break;

			case WebaWaterPass.OUTPUT.Beauty:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
				this.copyMaterial.blending = NoBlending;
				this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;


			case WebaWaterPass.OUTPUT.Normal:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.normalRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			case WebaWaterPass.OUTPUT.Metalness:

				this.copyMaterial.uniforms[ 'tDiffuse' ].value = this.metalnessRenderTarget.texture;
				this.copyMaterial.blending = NoBlending;
				this.renderPass( renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer );

				break;

			default:
				console.warn( 'THREE.WebaWaterPass: Unknown output type.' );

		}
		if(this.foamDepthMaterial && this.foamRenderTarget){

            this.originalClearColor.copy( renderer.getClearColor( this.tempColor ) );
            const originalClearAlpha = renderer.getClearAlpha( this.tempColor );
            const originalAutoClear = renderer.autoClear;

            renderer.setRenderTarget(this.foamRenderTarget);
            renderer.autoClear = false;

            const clearColor = this.foamDepthMaterial.clearColor || 0;
            const clearAlpha = this.foamDepthMaterial.clearAlpha || 0;

            if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

                renderer.setClearColor( clearColor );
                renderer.setClearAlpha( clearAlpha || 0.0 );
                renderer.clear();

            }

			for(const invisibleSelect of this.invisibleSelects){
				
				invisibleSelect.visible = false; 
			}
            this.scene.overrideMaterial = this.foamDepthMaterial;
      
            // renderer.setRenderTarget(this.renderTarget);
            renderer.render(this.scene, this.camera);
            renderer.setRenderTarget(null);
      
            this.scene.overrideMaterial = null;
			for(const invisibleSelect of this.invisibleSelects){
				invisibleSelect.visible = true; 
			}

            renderer.autoClear = originalAutoClear;
            renderer.setClearColor( this.originalClearColor );
            renderer.setClearAlpha( originalClearAlpha );
        }

	}

	renderPass( renderer, passMaterial, renderTarget, clearColor, clearAlpha ) {

		// save original state
		this.originalClearColor.copy( renderer.getClearColor( this.tempColor ) );
		const originalClearAlpha = renderer.getClearAlpha( this.tempColor );
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );

		// setup pass state
		renderer.autoClear = false;
		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.fsQuad.material = passMaterial;
		this.fsQuad.render( renderer );

		// restore original state
		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this.originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}

	renderOverride( renderer, overrideMaterial, renderTarget, clearColor, clearAlpha ) {

		this.originalClearColor.copy( renderer.getClearColor( this.tempColor ) );
		const originalClearAlpha = renderer.getClearAlpha( this.tempColor );
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );
		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.scene.overrideMaterial = overrideMaterial;
		renderer.render( this.scene, this.camera );
		this.scene.overrideMaterial = null;

		// restore original state

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this.originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}

	renderEdgeBlur( renderer, overrideMaterial, renderTarget, clearColor, clearAlpha ) {

		this.originalClearColor.copy( renderer.getClearColor( this.tempColor ) );
		const originalClearAlpha = renderer.getClearAlpha( this.tempColor );
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );

		// setup pass state
		renderer.autoClear = false;
		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.scene.traverseVisible( child => {

			child._WebaWaterPassBackupMaterial = child.material;
			if ( this._selects.includes( child ) ) {

				child.material = overrideMaterial;

			} 

		} );
		
		renderer.render( this.scene, this.camera );
		this.scene.traverseVisible( child => {

			child.material = child._WebaWaterPassBackupMaterial;

		} );

		// restore original state

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this.originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}
	renderMetalness( renderer, overrideMaterial, renderTarget, clearColor, clearAlpha ) {

		this.originalClearColor.copy( renderer.getClearColor( this.tempColor ) );
		const originalClearAlpha = renderer.getClearAlpha( this.tempColor );
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );
		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.scene.traverseVisible( child => {

			child._WebaWaterPassBackupMaterial = child.material;
			if ( this._selects.includes( child ) ) {

				child.material = this.metalnessOnMaterial;

			} else {

				child.material = this.metalnessOffMaterial;

			}

		} );
		for(const invisibleSelect of this.invisibleSelects){
			invisibleSelect.visible = false; 
		}
		renderer.render( this.scene, this.camera );
		for(const invisibleSelect of this.invisibleSelects){
				
			invisibleSelect.visible = true; 
		}
		this.scene.traverseVisible( child => {

			child.material = child._WebaWaterPassBackupMaterial;

		} );
		

		// restore original state

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this.originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

		this.renderPlayer( renderer, this.playerOnMaterial, this.playerRenderTarget, 0, 0 );

	}
	renderPlayer( renderer, overrideMaterial, renderTarget, clearColor, clearAlpha ) {

		this.originalClearColor.copy( renderer.getClearColor( this.tempColor ) );
		const originalClearAlpha = renderer.getClearAlpha( this.tempColor );
		const originalAutoClear = renderer.autoClear;

		renderer.setRenderTarget( renderTarget );
		renderer.autoClear = false;

		clearColor = overrideMaterial.clearColor || clearColor;
		clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

		if ( ( clearColor !== undefined ) && ( clearColor !== null ) ) {

			renderer.setClearColor( clearColor );
			renderer.setClearAlpha( clearAlpha || 0.0 );
			renderer.clear();

		}

		this.scene.traverseVisible( child => {

			child._WebaWaterPassBackupMaterial = child.material;
			if ( this._selects.includes( child ) ) {

				child.material = this.playerOnMaterial;

			} else {

				child.material = this.playerOffMaterial;

			}

		} );
		renderer.render( this.scene, this.camera );
		this.scene.traverseVisible( child => {

			child.material = child._WebaWaterPassBackupMaterial;

		} );
		

		// restore original state

		renderer.autoClear = originalAutoClear;
		renderer.setClearColor( this.originalClearColor );
		renderer.setClearAlpha( originalClearAlpha );

	}
	

	setSize( width, height ) {

		this.width = width;
		this.height = height;

		this.ssrMaterial.defines.MAX_STEP = Math.sqrt( width * width + height * height );
		this.ssrMaterial.needsUpdate = true;
		// this.beautyRenderTarget.setSize( width, height );
		this.prevRenderTarget.setSize( width, height );
		this.ssrRenderTarget.setSize( width, height );
		this.normalRenderTarget.setSize( width, height );
		this.metalnessRenderTarget.setSize( width, height );
		this.blurRenderTarget.setSize( width, height );
		this.blurRenderTarget2.setSize( width, height );
		// this.blurRenderTarget3.setSize(width, height);

		this.ssrMaterial.uniforms[ 'resolution' ].value.set( width, height );
		this.ssrMaterial.uniforms[ 'cameraProjectionMatrix' ].value.copy( this.camera.projectionMatrix );
		this.ssrMaterial.uniforms[ 'cameraInverseProjectionMatrix' ].value.copy( this.camera.projectionMatrixInverse );

		this.blurMaterial.uniforms[ 'resolution' ].value.set( width, height );
		this.blurMaterial2.uniforms[ 'resolution' ].value.set( width, height );

	}

}

WebaWaterPass.OUTPUT = {
	'Default': 0,
	'SSR': 1,
	'Beauty': 3,
	'Normal': 5,
	'Metalness': 7,
};

export { WebaWaterPass };