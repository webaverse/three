import { Mesh } from './Mesh.js';
import { Matrix4 } from '../math/Matrix4.js';
import { Vector3 } from '../math/Vector3.js';
import { Vector4 } from '../math/Vector4.js';

const _basePosition = /*@__PURE__*/ new Vector3();

const _skinIndex = /*@__PURE__*/ new Vector4();
const _skinWeight = /*@__PURE__*/ new Vector4();

const _vector = /*@__PURE__*/ new Vector3();
const _matrix = /*@__PURE__*/ new Matrix4();

const _identityMatrix = /*@__PURE__*/ new Matrix4();

class SkinnedMesh extends Mesh {

	constructor( geometry, material ) {

		super( geometry, material );

		this.type = 'SkinnedMesh';

		this.bindMode = 'attached';
		this.bindMatrix = new Matrix4();
		this.bindMatrixInverse = new Matrix4();
		this.parentMatrixWorld = new Matrix4();
		this.parentMatrixWorldInverse = new Matrix4();

	}

	copy( source ) {

		super.copy( source );

		this.bindMode = source.bindMode;
		this.bindMatrix.copy( source.bindMatrix );
		this.bindMatrixInverse.copy( source.bindMatrixInverse );
		this.parentMatrixWorld.copy( source.parentMatrixWorld );
		this.parentMatrixWorldInverse.copy( source.parentMatrixWorldInverse );

		this.skeleton = source.skeleton;

		return this;

	}

	_updateParentMatrix() {

		if (this.parent === null) {

			this.parentMatrixWorld.copy( _identityMatrix );

		} else {

			this.parentMatrixWorld.copy( this.parent.matrixWorld );

		}

		this.parentMatrixWorldInverse.copy( this.parentMatrixWorld ).invert();

		this.skeleton.setReferenceCoordinate( this.parentMatrixWorld, this.parentMatrixWorldInverse );

	}

	bind( skeleton, bindMatrix ) {

		this.skeleton = skeleton;

		if ( bindMatrix === undefined ) {

			this.updateMatrixWorld( true );

			this.skeleton.calculateInverses();

			bindMatrix = this.matrix;

		}

		this.bindMatrix.copy( bindMatrix );
		this.bindMatrixInverse.copy( bindMatrix ).invert();

	}

	pose() {

		this.skeleton.pose();

	}

	normalizeSkinWeights() {

		const vector = new Vector4();

		const skinWeight = this.geometry.attributes.skinWeight;

		for ( let i = 0, l = skinWeight.count; i < l; i ++ ) {

			vector.x = skinWeight.getX( i );
			vector.y = skinWeight.getY( i );
			vector.z = skinWeight.getZ( i );
			vector.w = skinWeight.getW( i );

			const scale = 1.0 / vector.manhattanLength();

			if ( scale !== Infinity ) {

				vector.multiplyScalar( scale );

			} else {

				vector.set( 1, 0, 0, 0 ); // do something reasonable

			}

			skinWeight.setXYZW( i, vector.x, vector.y, vector.z, vector.w );

		}

	}

	updateMatrixWorld( force ) {

		const parent = this.parent;
		this.parent = null;
		super.updateMatrixWorld( force );
		this.parent = parent;
		
		this._updateParentMatrix();

		if ( this.bindMode === 'attached' ) {

			this.bindMatrixInverse.copy( this.matrix ).invert();

		} else if ( this.bindMode === 'detached' ) {

			this.bindMatrixInverse.copy( this.bindMatrix ).invert();

		} else {

			console.warn( 'THREE.SkinnedMesh: Unrecognized bindMode: ' + this.bindMode );

		}

		this.matrixWorld.multiplyMatrices( this.parentMatrixWorld, this.matrix );

	}

	boneTransform( index, target ) {

		const skeleton = this.skeleton;
		const geometry = this.geometry;

		_skinIndex.fromBufferAttribute( geometry.attributes.skinIndex, index );
		_skinWeight.fromBufferAttribute( geometry.attributes.skinWeight, index );

		_basePosition.copy( target ).applyMatrix4( this.bindMatrix );

		target.set( 0, 0, 0 );

		for ( let i = 0; i < 4; i ++ ) {

			const weight = _skinWeight.getComponent( i );

			if ( weight !== 0 ) {

				const boneIndex = _skinIndex.getComponent( i );

				_matrix.multiplyMatrices(
					this.parentMatrixWorld,
					skeleton.bones[ boneIndex ].matrixWorld
					).multiply( skeleton.boneInverses[ boneIndex ] );

				target.addScaledVector( _vector.copy( _basePosition ).applyMatrix4( _matrix ), weight );

			}

		}

		return target.applyMatrix4( this.bindMatrixInverse );

	}

}

SkinnedMesh.prototype.isSkinnedMesh = true;

export { SkinnedMesh };
