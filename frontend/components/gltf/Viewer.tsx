import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { useAppStore } from "@/lib/store";
import { useEffect, useRef } from "react";

// 声明全局类型
declare global {
  interface Window {
    viewer?: {
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      renderer?: THREE.WebGLRenderer;
    };
  }
}

function GLTFModel() {
  // 使用 useAppStore 获取状态
  const modelViewerOptions = useAppStore((state) => state.modelViewerOptions);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | undefined>(undefined);
  const cameraRef = useRef<THREE.PerspectiveCamera | undefined>(undefined);
  const rendererRef = useRef<THREE.WebGLRenderer | undefined>(undefined);
  const controlsRef = useRef<OrbitControls | undefined>(undefined);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // 强制渲染函数
  const forceRender = () => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      try {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        return true;
      } catch (error) {
        console.error("渲染失败:", error);
        return false;
      }
    }
    return false;
  };

  // 初始化场景
  useEffect(() => {
    console.log("初始化场景开始");
    if (!containerRef.current) {
      console.log("容器未就绪");
      return;
    }

    // 创建场景
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x999999, 0.1, 500000); // 增加雾的范围
    scene.background = new THREE.Color(0x999999);
    sceneRef.current = scene;

    // 获取容器尺寸
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // 创建相机 - 使用容器的宽高比
    const camera = new THREE.PerspectiveCamera(
      60, // 视野角度
      containerWidth / containerHeight, // 使用容器的宽高比
      0.01, // 近平面距离
      500000 // 远平面距离
    );
    camera.position.set(0, 0, 5); // 将相机位置设置为正前方
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true, // 添加对数深度缓冲
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制像素比
    renderer.setSize(containerWidth, containerHeight); // 使用容器的尺寸
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 添加控制器
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 1000000; // 设置最大距离
    controls.minDistance = 0.1; // 设置最小距离
    controls.target.set(0, 0, 0); // 确保控制器目标在原点
    controls.update();
    controlsRef.current = controls;

    // 将场景对象暴露到全局
    window.viewer = {
      scene: scene,
      camera: camera,
      controls: controls,
      renderer: renderer,
    };

    // 添加坐标轴
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // 添加环境光和平行光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    // 设置阴影相机参数
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 500000;
    directionalLight.shadow.camera.left = -10000;
    directionalLight.shadow.camera.right = 10000;
    directionalLight.shadow.camera.top = 10000;
    directionalLight.shadow.camera.bottom = -10000;
    scene.add(directionalLight);

    // 窗口大小变化处理
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current || !containerRef.current)
        return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
      forceRender();
    };
    window.addEventListener("resize", handleResize);

    // 动画循环
    let isAnimating = true;
    const animate = () => {
      if (!isAnimating) return;

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      // 添加性能检查
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        try {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        } catch (error) {
          console.error("渲染循环出错:", error);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
    console.log("初始化场景完成");

    return () => {
      console.log("清理场景");
      window.removeEventListener("resize", handleResize);
      isAnimating = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.remove();
      }
    };
  }, []);

  // 监听 modelViewerOptions.document 的变化
  useEffect(() => {
    if (modelViewerOptions?.document) {
      console.log("检测到模型路径变化:", modelViewerOptions.document);
      loadModel(modelViewerOptions.document);
    }
  }, [modelViewerOptions?.document]);

  // 模型加载函数
  const loadModel = (documentPath: string) => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) {
      console.error("场景组件未就绪，无法加载模型");
      return;
    }

    // 规范化URL路径，确保使用正斜杠
    const normalizedPath = documentPath.replace(/\\/g, "/");

    console.log("开始加载模型:", normalizedPath);

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    // 清除现有模型
    scene.children.forEach((child) => {
      if (
        !(child instanceof THREE.AxesHelper) &&
        !(child instanceof THREE.AmbientLight) &&
        !(child instanceof THREE.DirectionalLight)
      ) {
        scene.remove(child);
      }
    });

    const manager = new THREE.LoadingManager();

    manager.onStart = (url, itemsLoaded, itemsTotal) => {
      console.log("开始加载资源:", { url, itemsLoaded, itemsTotal });
    };

    manager.onProgress = (url, loaded, total) => {
      const progress = ((loaded / total) * 100).toFixed(2);
      console.log(`加载进度: ${progress}%`, { url, loaded, total });
    };

    manager.onLoad = () => {
      console.log("所有资源加载完成");
      requestAnimationFrame(() => {
        forceRender();
        console.log("加载完成后强制渲染执行");
      });
    };

    manager.onError = (url) => {
      console.error("加载资源失败:", url);
    };

    const loader = new GLTFLoader(manager);

    try {
      loader.load(
        normalizedPath,
        (gltf: any) => {
          console.log("GLTF加载成功，开始处理模型");

          if (gltf?.scene) {
            // 优化模型处理
            gltf.scene.traverse((node: any) => {
              if (node instanceof THREE.Mesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                // 优化几何体
                if (node.geometry) {
                  node.geometry.computeBoundingBox();
                  node.geometry.computeBoundingSphere();
                }

                // 对于大型模型，尝试优化材质
                if (node.material) {
                  // 降低材质复杂度
                  if (node.material.roughness !== undefined) {
                    node.material.roughness = Math.max(
                      0.4,
                      node.material.roughness
                    );
                  }
                  // 禁用不必要的材质特性
                  if (node.material.envMap) {
                    node.material.envMapIntensity = Math.min(
                      1,
                      node.material.envMapIntensity || 1
                    );
                  }
                }
              }
            });

            // 将模型添加到场景前先居中
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            console.log("模型尺寸:", {
              width: size.x,
              height: size.y,
              depth: size.z,
              体积: size.x * size.y * size.z,
            });

            // 检测是否为极大模型
            const isVeryLargeModel =
              size.x > 10000 || size.y > 10000 || size.z > 10000;

            // 如果是极大模型，应用缩放
            if (isVeryLargeModel) {
              console.log("检测到极大模型，应用自动缩放");
              const maxDimension = Math.max(size.x, size.y, size.z);
              const scaleFactor = 100 / maxDimension; // 缩放到合理大小
              gltf.scene.scale.set(scaleFactor, scaleFactor, scaleFactor);

              // 重新计算边界盒
              box.setFromObject(gltf.scene);
              box.getCenter(center);
              box.getSize(size);

              console.log("缩放后尺寸:", {
                width: size.x,
                height: size.y,
                depth: size.z,
              });
            }

            // 将模型移动到原点
            gltf.scene.position.x = -center.x;
            gltf.scene.position.y = -center.y;
            gltf.scene.position.z = -center.z;

            scene.add(gltf.scene);

            // 重新计算边界
            const newBox = new THREE.Box3().setFromObject(gltf.scene);
            const newSize = newBox.getSize(new THREE.Vector3());
            const maxDim = Math.max(newSize.x, newSize.y, newSize.z);
            const diagonalLength = Math.sqrt(
              newSize.x * newSize.x +
                newSize.y * newSize.y +
                newSize.z * newSize.z
            );

            // 调整相机位置
            const fitOffset = 1.2; // 视图缩放系数
            const distance = Math.max(diagonalLength * fitOffset, maxDim * 2);

            // 使用更合适的相机位置
            const direction = new THREE.Vector3(1, 0.5, 1).normalize();
            const position = direction.multiplyScalar(distance);

            // 设置相机
            camera.position.copy(position);
            camera.lookAt(0, 0, 0); // 看向原点

            // 动态调整相机的近平面和远平面
            const near = Math.max(0.01, distance / 1000);
            const far = Math.min(1000000, distance * 1000);

            console.log("相机参数:", {
              position: camera.position,
              distance: distance,
              near: near,
              far: far,
            });

            camera.near = near;
            camera.far = far;
            camera.updateProjectionMatrix();

            // 设置控制器
            controls.target.set(0, 0, 0); // 控制器目标设为原点
            controls.maxDistance = distance * 5;
            controls.minDistance = distance * 0.05;
            controls.update();

            // 确保渲染
            requestAnimationFrame(() => {
              forceRender();
              // 二次渲染，确保模型显示
              setTimeout(() => {
                forceRender();
                console.log("延迟二次渲染执行");
              }, 100);
            });
          }
        },
        (progress: any) => {
          console.log("加载进度:", {
            loaded: progress.loaded,
            total: progress.total,
            进度: ((progress.loaded / progress.total) * 100).toFixed(2) + "%",
          });
        },
        (error: any) => {
          console.error("模型加载失败:", {
            错误类型: error.constructor.name,
            错误信息: error.message,
            加载路径: normalizedPath,
            堆栈信息: error.stack,
          });
        }
      );
    } catch (error) {
      console.error("加载过程发生错误:", error);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        visibility: "visible",
        position: "relative",
        zIndex: 1,
        overflow: "hidden",
      }}
    />
  );
}

export default GLTFModel;
